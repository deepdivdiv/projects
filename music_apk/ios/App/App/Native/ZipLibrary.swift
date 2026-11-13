import Foundation
import CryptoKit

/// ZIP 목차와 항목을 읽는다. (안드로이드 ZipReader.java)
final class ZipReader {
    struct Item {
        var index = 0
        var name = ""
        var directory = false
        var encrypted = false
        var method = 0
        var compressedSize: Int64 = 0
        var size: Int64 = 0
        var localOffset: Int64 = 0
    }

    private let file: SharedFile
    private(set) var items: [Item] = []

    init(url: URL) throws {
        file = try SharedFile(url: url)
        do {
            try readDirectory()
        } catch {
            file.close()
            if error is StreamError { throw error }
            throw StreamError.message("ZIP 목차를 읽을 수 없습니다.")
        }
    }

    func close() { file.close() }

    func item(_ index: Int) throws -> Item {
        guard index >= 0 && index < items.count else { throw StreamError.message("ZIP 안에서 파일을 찾을 수 없습니다.") }
        return items[index]
    }

    private func bytes(_ offset: Int64, _ count: Int) throws -> [UInt8] {
        let data = try file.read(at: offset, count: count)
        if data.count < count { throw StreamError.message("ZIP 파일이 손상되었습니다.") }
        return [UInt8](data)
    }

    private func readDirectory() throws {
        let size = file.size
        if size < 22 { throw StreamError.message("ZIP 파일이 아닙니다.") }
        let search = Int(min(size, 22 + 65535))
        let tail = try bytes(size - Int64(search), search)
        var end = -1
        var i = search - 22
        while i >= 0 {
            if tail.int32LE(i) == 0x06054b50 { end = i; break }
            i -= 1
        }
        if end < 0 { throw StreamError.message("ZIP 파일이 아닙니다.") }
        var count = Int64(tail.int16LE(end + 10))
        var directorySize = tail.int32LE(end + 12)
        var directoryOffset = tail.int32LE(end + 16)
        if end >= 20 && tail.int32LE(end - 20) == 0x07064b50 {
            let end64 = tail.int64LE(end - 12)
            let record = try bytes(end64, 56)
            if record.int32LE(0) != 0x06064b50 { throw StreamError.message("ZIP64 목차가 손상되었습니다.") }
            count = record.int64LE(32)
            directorySize = record.int64LE(40)
            directoryOffset = record.int64LE(48)
        }
        if count < 0 || count > 1_000_000 || directoryOffset < 0 || directorySize < 0 || directoryOffset + directorySize > size || directorySize > Int64(Int32.max) {
            throw StreamError.message("ZIP 목차가 손상되었습니다.")
        }
        let d = try bytes(directoryOffset, Int(directorySize))
        var p = 0
        for index in 0..<Int(count) {
            guard p + 46 <= d.count, d.int32LE(p) == 0x02014b50 else { throw StreamError.message("ZIP 목차가 손상되었습니다.") }
            let flags = d.int16LE(p + 8)
            var item = Item()
            item.index = index
            item.encrypted = (flags & 1) != 0
            item.method = d.int16LE(p + 10)
            item.compressedSize = d.int32LE(p + 20)
            item.size = d.int32LE(p + 24)
            let nameLength = d.int16LE(p + 28)
            let extraLength = d.int16LE(p + 30)
            let commentLength = d.int16LE(p + 32)
            item.localOffset = d.int32LE(p + 42)
            p += 46
            guard p + nameLength + extraLength + commentLength <= d.count else { throw StreamError.message("ZIP 목차가 손상되었습니다.") }
            let raw = Array(d[p..<(p + nameLength)])
            item.name = (flags & 0x800) != 0 ? (String(bytes: raw, encoding: .utf8) ?? TextDecoding.decode(raw)) : TextDecoding.decode(raw)
            item.directory = item.name.hasSuffix("/") || item.name.hasSuffix("\\")
            p += nameLength
            // ZIP64: 0xFFFFFFFF로 표시된 값만 차례로 들어 있다.
            var e = p
            let extraEnd = p + extraLength
            while e + 4 <= extraEnd {
                let id = d.int16LE(e), len = d.int16LE(e + 2)
                var q = e + 4
                let next = q + len
                if next > extraEnd { break }
                if id == 1 {
                    if item.size == 0xFFFFFFFF && q + 8 <= next { item.size = d.int64LE(q); q += 8 }
                    if item.compressedSize == 0xFFFFFFFF && q + 8 <= next { item.compressedSize = d.int64LE(q); q += 8 }
                    if item.localOffset == 0xFFFFFFFF && q + 8 <= next { item.localOffset = d.int64LE(q); q += 8 }
                }
                e = next
            }
            p = extraEnd + commentLength
            items.append(item)
        }
    }

    /// 항목을 position 바이트 지점부터 읽는다.
    func open(_ item: Item, position: Int64) throws -> ByteStream {
        if item.encrypted { throw StreamError.message("암호가 걸린 항목입니다.") }
        let local = try bytes(item.localOffset, 30)
        if local.int32LE(0) != 0x04034b50 { throw StreamError.message("ZIP 항목이 손상되었습니다.") }
        let data = item.localOffset + 30 + Int64(local.int16LE(26)) + Int64(local.int16LE(28))
        if item.method == 0 {
            let skip = min(position, item.size)
            return RegionStream(file: file, offset: data + skip, length: item.size - skip)
        }
        if item.method != 8 { throw StreamError.message("지원하지 않는 압축 방식입니다.") }
        let stream = try InflateStream(source: RegionStream(file: file, offset: data, length: item.compressedSize))
        try stream.skipFully(position)
        return stream
    }
}

/// ZIP을 풀지 않고 폴더처럼 다룬다. (안드로이드 ZipLibrary.java)
/// 목록(meta.json)만 앱 안에 저장하고, 곡은 재생할 때 그 곡만 캐시로 꺼낸다.
enum ZipLibrary {
    static let pathPrefix = "zip:"
    static let entryScheme = "zipentry"
    private static let maxHead = 16 * 1024 * 1024

    /// iOS 재생 엔진(AVAudioFile)이 해석할 수 있는 형식.
    private static let playable: Set<String> = ["mp3", "wav", "flac", "m4a", "m4b", "aac", "aif", "aiff", "aifc", "caf"]
    private static let unplayable: Set<String> = [
        "ogg", "oga", "opus", "weba", "mka", "amr", "awb", "3ga",
        "wma", "ape", "alac", "dsf", "dff", "mid", "midi", "wv", "tta", "mpc", "ra", "rm", "m4p",
    ]

    struct Source {
        let name: String
        let size: Int64
        let ref: String
    }

    static func ext(_ name: String) -> String {
        guard let dot = name.lastIndex(of: ".") else { return "" }
        return String(name[name.index(after: dot)...]).lowercased()
    }

    static func isAudio(_ name: String) -> Bool { playable.contains(ext(name)) }
    static func isUnplayableAudio(_ name: String) -> Bool { unplayable.contains(ext(name)) }
    static func isZip(_ name: String) -> Bool { name.lowercased().hasSuffix(".zip") }

    static func stripExtension(_ name: String) -> String {
        guard isAudio(name) || isUnplayableAudio(name), let dot = name.lastIndex(of: ".") else { return name }
        return String(name[..<dot])
    }

    static func hash(_ value: String) -> String {
        let digest = Insecure.SHA1.hash(data: Data(value.utf8))
        return digest.prefix(8).map { String(format: "%02x", $0) }.joined()
    }

    private static var root: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("zips", isDirectory: true)
    }

    private static func metaURL(_ id: String) -> URL { root.appendingPathComponent(id).appendingPathComponent("meta.json") }

    private static func readMeta(_ id: String) throws -> [String: Any] {
        let data = try Data(contentsOf: metaURL(id))
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw StreamError.message("ZIP을 찾을 수 없습니다.")
        }
        return json
    }

    private static func writeMeta(_ id: String, _ meta: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: meta)
        try data.write(to: metaURL(id), options: .atomic)
    }

    /// path는 화면에서 넘어오는 값이므로 16진수 id만 받는다.
    static func id(fromPath path: String) -> String? {
        guard path.hasPrefix(pathPrefix) else { return nil }
        let id = String(path.dropFirst(pathPrefix.count))
        return !id.isEmpty && id.allSatisfy({ $0.isHexDigit }) ? id : nil
    }

    /// 처음 열 때만 목록을 만들고, 그 뒤로는 저장해 둔 목록으로 바로 연다.
    static func open(_ zip: Source, onSlow: () -> Void) throws -> [String: Any] {
        let id = hash(zip.name + "/" + String(zip.size))
        if var meta = try? readMeta(id), let tracks = meta["tracks"] as? [[String: Any]], tracks.first?["index"] != nil {
            if meta["source"] as? String != zip.ref {
                meta["source"] = zip.ref // 파일을 옮겨도 계속 재생되게 한다.
                try? writeMeta(id, meta)
            }
            return try load(pathPrefix + id)
        }
        onSlow()
        let url = try FolderStore.shared.fileURL(zip.ref, download: true)
        let reader: ZipReader
        do {
            reader = try ZipReader(url: url)
        } catch {
            throw StreamError.message("손상된 ZIP이거나 지원하지 않는 형식입니다.")
        }
        defer { reader.close() }
        var entries: [(source: String, file: String, title: String, index: Int, duration: Int64)] = []
        for item in reader.items {
            let source = item.name.replacingOccurrences(of: "\\", with: "/")
            if item.directory || source.hasPrefix("__MACOSX/") || !isAudio(source) { continue }
            let base = source.components(separatedBy: "/").last ?? source
            if base.hasPrefix("._") { continue }
            if item.encrypted { throw StreamError.message("암호가 걸린 ZIP은 열 수 없습니다.") }
            let file = String(format: "%05d.%@", entries.count, ext(base))
            var duration: Int64 = 0
            if let input = try? reader.open(item, position: 0) {
                duration = (try? AudioProbe.durationMs(input, size: item.size, name: base)) ?? 0
            }
            entries.append((source, file, stripExtension(base), item.index, duration))
        }
        if entries.isEmpty { throw StreamError.message("ZIP 안에 재생할 수 있는 파일이 없습니다.") }
        entries.sort { naturalLess($0.source, $1.source) }
        let name = zip.name.lowercased().hasSuffix(".zip") ? String(zip.name.dropLast(4)) : zip.name
        let meta: [String: Any] = [
            "name": name,
            "source": zip.ref,
            "tracks": entries.map { ["file": $0.file, "title": $0.title, "index": $0.index, "duration": $0.duration] as [String: Any] },
        ]
        let dir = root.appendingPathComponent(id, isDirectory: true)
        try? FileManager.default.removeItem(at: dir)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try writeMeta(id, meta)
        return try load(pathPrefix + id)
    }

    /// 저장해 둔 목록을 폴더 형태로 읽는다.
    static func load(_ path: String) throws -> [String: Any] {
        guard let id = id(fromPath: path), let meta = try? readMeta(id) else { throw StreamError.message("ZIP을 찾을 수 없습니다.") }
        let source = meta["tracks"] as? [[String: Any]] ?? []
        let tracks: [[String: Any]] = source.map { t -> [String: Any] in
            [
                "uri": "\(entryScheme)://\(id)/\(t["file"] as? String ?? "")",
                "title": t["title"] as? String ?? "",
                "duration": (t["duration"] as? NSNumber)?.int64Value ?? 0,
            ]
        }
        var folder: [String: Any] = ["path": path, "name": meta["name"] as? String ?? "", "tracks": tracks]
        if let s = meta["source"] as? String { folder["source"] = s }
        return folder
    }

    private static func parse(_ uri: String) -> (id: String, file: String)? {
        guard let url = URL(string: uri), url.scheme == entryScheme, let host = url.host,
              host.allSatisfy({ $0.isHexDigit }) else { return nil }
        return (host, url.lastPathComponent)
    }

    private static func find(_ uri: String) throws -> (meta: [String: Any], track: [String: Any], id: String) {
        guard let parsed = parse(uri) else { throw StreamError.message("잘못된 ZIP 주소입니다.") }
        let id = parsed.id, file = parsed.file
        let meta = try readMeta(id)
        for t in meta["tracks"] as? [[String: Any]] ?? [] where t["file"] as? String == file {
            return (meta, t, id)
        }
        throw StreamError.message("ZIP 안에서 파일을 찾을 수 없습니다.")
    }

    /// ZIP 안 한 곡을 연다. 닫으면 ZIP도 닫힌다.
    static func openEntry(_ uri: String, position: Int64 = 0) throws -> (stream: ByteStream, size: Int64, reader: ZipReader) {
        let (meta, track, _) = try find(uri)
        let url = try FolderStore.shared.fileURL(meta["source"] as? String ?? "", download: true)
        let reader = try ZipReader(url: url)
        do {
            let item = try reader.item((track["index"] as? NSNumber)?.intValue ?? -1)
            return (try reader.open(item, position: position), item.size, reader)
        } catch {
            reader.close()
            throw error
        }
    }

    /// 곡이 들어 있는 ZIP 경로와 곡 제목.
    static func describe(_ uri: String) throws -> (source: String, title: String) {
        let (meta, track, _) = try find(uri)
        return (meta["source"] as? String ?? "", track["title"] as? String ?? "")
    }

    /// 태그와 앨범아트가 들어 있는 곡 앞부분을 읽는다.
    static func readHead(_ uri: String) throws -> [UInt8] {
        let entry = try openEntry(uri)
        defer { entry.reader.close() }
        return try readHead(entry.stream, total: entry.size)
    }

    static func readHead(_ input: ByteStream, total: Int64) throws -> [UInt8] {
        let head = try input.readFully(10)
        var tag: Int64 = 0
        if head.count == 10 && head.matches(0, "ID3") {
            tag = Int64(head[6] & 0x7F) << 21 | Int64(head[7] & 0x7F) << 14 | Int64(head[8] & 0x7F) << 7 | Int64(head[9] & 0x7F)
        }
        let wanted: Int64 = tag > 0 ? tag + 10 + 64 * 1024 : 4 * 1024 * 1024
        let size = Int(min(total, wanted, Int64(maxHead)))
        if head.count >= size { return Array(head.prefix(size)) }
        return try head + input.readFully(size - head.count)
    }

    private static var playCache: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("zipplay", isDirectory: true)
    }

    /// 재생할 곡만 캐시로 꺼낸다. 최근 몇 곡만 남기고 지운다.
    static func extract(_ uri: String) throws -> URL {
        guard let parsed = parse(uri) else { throw StreamError.message("잘못된 ZIP 주소입니다.") }
        let id = parsed.id, file = parsed.file
        let fm = FileManager.default
        try fm.createDirectory(at: playCache, withIntermediateDirectories: true)
        let target = playCache.appendingPathComponent("\(id)_\(file)")
        if fm.fileExists(atPath: target.path) {
            try? fm.setAttributes([.modificationDate: Date()], ofItemAtPath: target.path)
            return target
        }
        let entry = try openEntry(uri)
        defer { entry.reader.close() }
        let partial = target.appendingPathExtension("part")
        fm.createFile(atPath: partial.path, contents: nil)
        let out = try FileHandle(forWritingTo: partial)
        do {
            var buffer = [UInt8](repeating: 0, count: 256 * 1024)
            while true {
                let n = try buffer.withUnsafeMutableBufferPointer { try entry.stream.read($0.baseAddress!, $0.count) }
                if n <= 0 { break }
                try out.write(contentsOf: Data(buffer[0..<n]))
            }
            try out.close()
        } catch {
            try? out.close()
            try? fm.removeItem(at: partial)
            throw error
        }
        try fm.moveItem(at: partial, to: target)
        trimCache(keep: target)
        return target
    }

    private static func trimCache(keep: URL) {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: playCache, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        let sorted = files.sorted {
            let a = (try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            let b = (try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return a > b
        }
        for old in sorted.dropFirst(4) where old != keep {
            try? fm.removeItem(at: old)
        }
    }
}
