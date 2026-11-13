import Foundation
import Compression

/// 안드로이드의 InputStream에 해당한다. 0을 돌려주면 끝이다.
protocol ByteStream: AnyObject {
    func read(_ buffer: UnsafeMutablePointer<UInt8>, _ count: Int) throws -> Int
    func skip(_ count: Int64) throws -> Int64
    func close()
}

extension ByteStream {
    /// 읽을 수 있는 만큼 끝까지 읽는다.
    func readFully(_ count: Int) throws -> [UInt8] {
        if count <= 0 { return [] }
        var out = [UInt8](repeating: 0, count: count)
        var total = 0
        try out.withUnsafeMutableBufferPointer { p in
            while total < count {
                let n = try read(p.baseAddress! + total, count - total)
                if n <= 0 { break }
                total += n
            }
        }
        if total < count { out.removeSubrange(total..<count) }
        return out
    }

    func skipFully(_ count: Int64) throws {
        var left = count
        var scratch: [UInt8]? = nil
        while left > 0 {
            var skipped = try skip(left)
            if skipped <= 0 {
                if scratch == nil { scratch = [UInt8](repeating: 0, count: 8192) }
                let n = try scratch!.withUnsafeMutableBufferPointer { try read($0.baseAddress!, Int(min(Int64(8192), left))) }
                if n <= 0 { return }
                skipped = Int64(n)
            }
            left -= skipped
        }
    }

    func close() {}
}

enum StreamError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        if case .message(let m) = self { return m }
        return nil
    }
}

/// 파일 한 구간을 읽는다. 여러 스트림이 같은 파일 핸들을 함께 쓸 수 있도록 위치는 각자 가진다.
final class SharedFile {
    let handle: FileHandle
    let size: Int64
    private let lock = NSLock()

    init(url: URL) throws {
        handle = try FileHandle(forReadingFrom: url)
        size = Int64(try handle.seekToEnd())
    }

    func read(at offset: Int64, count: Int) throws -> Data {
        lock.lock()
        defer { lock.unlock() }
        try handle.seek(toOffset: UInt64(offset))
        return try handle.read(upToCount: count) ?? Data()
    }

    func close() {
        try? handle.close()
    }
}

final class RegionStream: ByteStream {
    private let file: SharedFile
    private var position: Int64
    private var remaining: Int64
    private let ownsFile: Bool

    init(file: SharedFile, offset: Int64, length: Int64, ownsFile: Bool = false) {
        self.file = file
        self.position = offset
        self.remaining = max(0, length)
        self.ownsFile = ownsFile
    }

    static func whole(_ url: URL) throws -> RegionStream {
        let file = try SharedFile(url: url)
        return RegionStream(file: file, offset: 0, length: file.size, ownsFile: true)
    }

    func read(_ buffer: UnsafeMutablePointer<UInt8>, _ count: Int) throws -> Int {
        if count == 0 || remaining <= 0 { return 0 }
        let want = Int(min(Int64(count), remaining, 256 * 1024))
        let data = try file.read(at: position, count: want)
        if data.isEmpty { return 0 }
        data.copyBytes(to: buffer, count: data.count)
        position += Int64(data.count)
        remaining -= Int64(data.count)
        return data.count
    }

    func skip(_ count: Int64) throws -> Int64 {
        let n = max(0, min(count, remaining))
        position += n
        remaining -= n
        return n
    }

    func close() {
        if ownsFile { file.close() }
    }
}

/// 메모리에 있는 앞부분을 먼저 읽고 이어서 원래 스트림을 읽는다.
final class PrefixedStream: ByteStream {
    private var prefix: [UInt8]
    private var offset = 0
    private let rest: ByteStream

    init(prefix: [UInt8], rest: ByteStream) {
        self.prefix = prefix
        self.rest = rest
    }

    func read(_ buffer: UnsafeMutablePointer<UInt8>, _ count: Int) throws -> Int {
        if offset < prefix.count {
            let n = min(count, prefix.count - offset)
            prefix.withUnsafeBufferPointer { p in buffer.update(from: p.baseAddress! + offset, count: n) }
            offset += n
            return n
        }
        return try rest.read(buffer, count)
    }

    func skip(_ count: Int64) throws -> Int64 {
        if offset < prefix.count {
            let n = Int(min(count, Int64(prefix.count - offset)))
            offset += n
            return Int64(n)
        }
        return try rest.skip(count)
    }

    func close() { rest.close() }
}

/// ZIP의 deflate 항목을 풀면서 읽는다. (헤더 없는 raw deflate = COMPRESSION_ZLIB)
final class InflateStream: ByteStream {
    private static let chunk = 64 * 1024
    private let source: ByteStream
    private let stream: UnsafeMutablePointer<compression_stream>
    private let inputPtr: UnsafeMutablePointer<UInt8>
    private var sourceDone = false
    private var finished = false

    init(source: ByteStream) throws {
        // 초기화에 실패하면 속성을 채우기 전에 던져서 deinit이 돌지 않게 한다.
        let s = UnsafeMutablePointer<compression_stream>.allocate(capacity: 1)
        guard compression_stream_init(s, COMPRESSION_STREAM_DECODE, COMPRESSION_ZLIB) == COMPRESSION_STATUS_OK else {
            s.deallocate()
            throw StreamError.message("압축을 풀 수 없습니다.")
        }
        self.source = source
        stream = s
        inputPtr = UnsafeMutablePointer<UInt8>.allocate(capacity: InflateStream.chunk)
        stream.pointee.src_ptr = UnsafePointer(inputPtr)
        stream.pointee.src_size = 0
    }

    deinit {
        compression_stream_destroy(stream)
        stream.deallocate()
        inputPtr.deallocate()
    }

    func read(_ buffer: UnsafeMutablePointer<UInt8>, _ count: Int) throws -> Int {
        if finished || count == 0 { return 0 }
        stream.pointee.dst_ptr = buffer
        stream.pointee.dst_size = count
        while stream.pointee.dst_size == count {
            if stream.pointee.src_size == 0 && !sourceDone {
                let n = try source.read(inputPtr, InflateStream.chunk)
                if n <= 0 {
                    sourceDone = true
                } else {
                    stream.pointee.src_ptr = UnsafePointer(inputPtr)
                    stream.pointee.src_size = n
                }
            }
            let flags = sourceDone ? Int32(COMPRESSION_STREAM_FINALIZE.rawValue) : 0
            let status = compression_stream_process(stream, flags)
            if status == COMPRESSION_STATUS_END {
                finished = true
                break
            }
            if status == COMPRESSION_STATUS_ERROR {
                throw StreamError.message("ZIP 항목이 손상되었습니다.")
            }
            if sourceDone && stream.pointee.src_size == 0 && stream.pointee.dst_size == count {
                finished = true
                break
            }
        }
        return count - stream.pointee.dst_size
    }

    func skip(_ count: Int64) throws -> Int64 { 0 }

    func close() { source.close() }
}

extension Array where Element == UInt8 {
    func matches(_ i: Int, _ text: String) -> Bool {
        let t = Array(text.utf8)
        if i < 0 || i + t.count > count { return false }
        for k in 0..<t.count where self[i + k] != t[k] { return false }
        return true
    }

    func int32BE(_ i: Int) -> Int64 {
        Int64(self[i]) << 24 | Int64(self[i + 1]) << 16 | Int64(self[i + 2]) << 8 | Int64(self[i + 3])
    }

    func int32LE(_ i: Int) -> Int64 {
        Int64(self[i]) | Int64(self[i + 1]) << 8 | Int64(self[i + 2]) << 16 | Int64(self[i + 3]) << 24
    }

    func int16LE(_ i: Int) -> Int {
        Int(self[i]) | Int(self[i + 1]) << 8
    }

    func int64LE(_ i: Int) -> Int64 {
        int32LE(i) | int32LE(i + 4) << 32
    }
}

enum TextDecoding {
    static let cp949 = String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(CFStringEncoding(CFStringEncodings.dosKorean.rawValue)))

    /// 윈도우에서 만든 ZIP과 국내 MP3 태그는 CP949인 경우가 많다.
    static func decode(_ bytes: [UInt8]) -> String {
        if let s = String(bytes: bytes, encoding: .utf8) { return s }
        if let s = String(bytes: bytes, encoding: cp949) { return s }
        return String(bytes: bytes, encoding: .isoLatin1) ?? ""
    }
}

/// 1, 2, 10 순서가 되도록 숫자를 값으로 비교한다.
func naturalLess(_ a: String, _ b: String) -> Bool {
    naturalCompare(a, b) < 0
}

func naturalCompare(_ a: String, _ b: String) -> Int {
    let x = Array(a), y = Array(b)
    var i = 0, j = 0
    while i < x.count && j < y.count {
        let p = x[i], q = y[j]
        if p.isASCII && p.isNumber && q.isASCII && q.isNumber {
            let si = i, sj = j
            while i < x.count && x[i].isASCII && x[i].isNumber { i += 1 }
            while j < y.count && y[j].isASCII && y[j].isNumber { j += 1 }
            var n = String(x[si..<i]), m = String(y[sj..<j])
            while n.count > 1 && n.hasPrefix("0") { n.removeFirst() }
            while m.count > 1 && m.hasPrefix("0") { m.removeFirst() }
            if n.count != m.count { return n.count - m.count }
            if n != m { return n < m ? -1 : 1 }
        } else {
            let lp = p.lowercased(), lq = q.lowercased()
            if lp != lq { return lp < lq ? -1 : 1 }
            i += 1
            j += 1
        }
    }
    return (x.count - i) - (y.count - j)
}
