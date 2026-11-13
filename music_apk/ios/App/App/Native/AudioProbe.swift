import Foundation

/// 파일 앞부분만 읽어 재생 길이(ms)를 구한다. 안드로이드 AudioProbe.java와 같은 방식이다.
/// 알 수 없으면 0을 돌려주고, 재생이 시작되면 플레이어가 실제 길이를 알려준다.
enum AudioProbe {
    private static let window = 64 * 1024
    private static let bitrates: [[Int]] = [
        [32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
        [32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
        [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
        [32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
        [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    ]
    private static let sampleRates = [44100, 48000, 32000]
    private static let adtsRates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]

    static func durationMs(_ input: ByteStream, size: Int64, name: String) throws -> Int64 {
        let head = try input.readFully(10)
        if head.count < 10 { return 0 }
        var audioStart: Int64 = 0
        var buf: [UInt8]
        if head.matches(0, "ID3") {
            let tag = Int64(head[6] & 0x7F) << 21 | Int64(head[7] & 0x7F) << 14 | Int64(head[8] & 0x7F) << 7 | Int64(head[9] & 0x7F)
            audioStart = tag + 10 + ((head[5] & 0x10) != 0 ? 10 : 0)
            try input.skipFully(audioStart - 10)
            buf = try input.readFully(window)
        } else {
            buf = try head + input.readFully(window - 10)
        }
        if buf.count < 12 { return 0 }
        if buf.matches(0, "OggS") { return try oggDuration(input, buf) }
        if buf.matches(0, "fLaC") { return flacDuration(buf) }
        if buf.matches(0, "RIFF") && buf.matches(8, "WAVE") { return wavDuration(buf, size - audioStart) }
        if buf.matches(4, "ftyp") { return try mp4Duration(PrefixedStream(prefix: buf, rest: input)) }
        if buf[0] == 0xFF && (buf[1] & 0xF6) == 0xF0 { return adtsDuration(buf, size - audioStart) }
        return name.lowercased().hasSuffix(".mp3") ? mp3Duration(buf, size - audioStart) : 0
    }

    private static func flacDuration(_ b: [UInt8]) -> Int64 {
        if b.count < 26 { return 0 }
        let rate = Int64(b[18]) << 12 | Int64(b[19]) << 4 | Int64(b[20] & 0xF0) >> 4
        let samples = Int64(b[21] & 0x0F) << 32 | b.int32BE(22)
        return rate > 0 ? Int64(Double(samples) * 1000 / Double(rate)) : 0
    }

    private static func wavDuration(_ b: [UInt8], _ fileSize: Int64) -> Int64 {
        var byteRate: Int64 = 0
        var i = 12
        while i + 8 <= b.count {
            let chunk = b.int32LE(i + 4)
            if b.matches(i, "fmt ") && i + 20 <= b.count {
                byteRate = b.int32LE(i + 16)
            } else if b.matches(i, "data") {
                let available = fileSize - Int64(i) - 8
                let data = chunk == 0 || chunk > available ? available : chunk
                return byteRate > 0 ? data * 1000 / byteRate : 0
            }
            let next = Int64(i) + 8 + chunk + (chunk & 1)
            if next > Int64(b.count) { return 0 }
            i = Int(next)
        }
        return 0
    }

    private static func mp4Duration(_ input: ByteStream) throws -> Int64 {
        for _ in 0..<10000 {
            var h = try input.readFully(8)
            if h.count < 8 { return 0 }
            var size = h.int32BE(0)
            var header: Int64 = 8
            if size == 1 {
                let ext = try input.readFully(8)
                if ext.count < 8 { return 0 }
                size = ext.int32BE(0) << 32 | ext.int32BE(4)
                header = 16
            }
            if h.matches(4, "moov") { continue }
            if h.matches(4, "mvhd") {
                h = try input.readFully(32)
                if h.count < 32 { return 0 }
                let wide = h[0] == 1
                let timescale = h.int32BE(wide ? 20 : 12)
                let duration = wide ? (h.int32BE(24) << 32 | h.int32BE(28)) : h.int32BE(16)
                return timescale > 0 ? Int64(Double(duration) * 1000 / Double(timescale)) : 0
            }
            if size < header { return 0 }
            try input.skipFully(size - header)
        }
        return 0
    }

    private static func adtsDuration(_ b: [UInt8], _ audioSize: Int64) -> Int64 {
        var frames: Int64 = 0, i = 0, rate = 0
        while i + 7 <= b.count && b[i] == 0xFF && (b[i + 1] & 0xF6) == 0xF0 {
            let rateIndex = Int((b[i + 2] >> 2) & 15)
            let frame = Int(b[i + 3] & 3) << 11 | Int(b[i + 4]) << 3 | Int(b[i + 5] & 0xE0) >> 5
            if rateIndex >= adtsRates.count || frame < 7 { break }
            rate = adtsRates[rateIndex]
            frames += 1
            i += frame
        }
        return frames == 0 || i == 0 ? 0 : Int64(Double(audioSize) * Double(frames) * 1024 * 1000 / Double(i) / Double(rate))
    }

    private struct Frame {
        var mpeg1 = false, mono = false
        var bitrateKbps = 0, sampleRate = 0, samples = 0, bytes = 0

        static func parse(_ b: [UInt8], _ i: Int) -> Frame? {
            if i + 4 > b.count || b[i] != 0xFF || (b[i + 1] & 0xE0) != 0xE0 { return nil }
            let version = Int(b[i + 1] >> 3) & 3
            let layer = Int(b[i + 1] >> 1) & 3
            let bitrateIndex = Int(b[i + 2] >> 4) & 15
            let rateIndex = Int(b[i + 2] >> 2) & 3
            if version == 1 || layer == 0 || bitrateIndex == 0 || bitrateIndex == 15 || rateIndex == 3 { return nil }
            var f = Frame()
            f.mpeg1 = version == 3
            f.mono = (Int(b[i + 3] >> 6) & 3) == 3
            let table = f.mpeg1 ? 3 - layer : (layer == 3 ? 3 : 4)
            f.bitrateKbps = AudioProbe.bitrates[table][bitrateIndex - 1]
            f.sampleRate = AudioProbe.sampleRates[rateIndex] >> (version == 3 ? 0 : version == 2 ? 1 : 2)
            f.samples = layer == 3 ? 384 : (layer == 1 && !f.mpeg1 ? 576 : 1152)
            let padding = Int(b[i + 2] >> 1) & 1
            f.bytes = layer == 3
                ? (12 * f.bitrateKbps * 1000 / f.sampleRate + padding) * 4
                : f.samples / 8 * f.bitrateKbps * 1000 / f.sampleRate + padding
            return f.bytes > 0 ? f : nil
        }
    }

    private static func mp3Duration(_ b: [UInt8], _ audioSize: Int64) -> Int64 {
        var i = 0
        while i + 4 <= b.count {
            defer { i += 1 }
            guard let f = Frame.parse(b, i) else { continue }
            let next = i + f.bytes
            if next + 4 <= b.count && Frame.parse(b, next) == nil { continue }
            let frames = vbrFrames(b, i, f)
            if frames > 0 { return frames * Int64(f.samples) * 1000 / Int64(f.sampleRate) }
            return (audioSize - Int64(i)) * 8 / Int64(f.bitrateKbps)
        }
        return 0
    }

    private static func vbrFrames(_ b: [UInt8], _ frame: Int, _ f: Frame) -> Int64 {
        let xing = frame + 4 + (f.mpeg1 ? (f.mono ? 17 : 32) : (f.mono ? 9 : 17))
        if xing + 12 <= b.count && (b.matches(xing, "Xing") || b.matches(xing, "Info")) && (b[xing + 7] & 1) != 0 {
            return b.int32BE(xing + 8)
        }
        let vbri = frame + 36
        if vbri + 18 <= b.count && b.matches(vbri, "VBRI") {
            return b.int32BE(vbri + 14)
        }
        return 0
    }

    /// OGG는 마지막 페이지의 샘플 위치를 읽어야 정확하다.
    private static func oggDuration(_ input: ByteStream, _ first: [UInt8]) throws -> Int64 {
        var rate: Int64 = 0
        var i = 0
        while i + 28 <= first.count && i < 512 {
            if first[i] == 1 && first.matches(i + 1, "vorbis") { rate = first.int32LE(i + 12); break }
            if first.matches(i, "OpusHead") { rate = 48000; break }
            i += 1
        }
        if rate <= 0 { return 0 }
        var tail = first
        while true {
            let chunk = try input.readFully(window)
            if chunk.isEmpty { break }
            tail += chunk
            if tail.count > window * 2 { tail.removeFirst(tail.count - window * 2) }
        }
        var k = tail.count - 14
        while k >= 0 {
            if tail.matches(k, "OggS") {
                let granule = tail.int32LE(k + 6) | tail.int32LE(k + 10) << 32
                return granule > 0 ? Int64(Double(granule) * 1000 / Double(rate)) : 0
            }
            k -= 1
        }
        return 0
    }
}
