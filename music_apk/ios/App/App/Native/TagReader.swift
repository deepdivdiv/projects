import Foundation

/// MP3의 ID3v2 태그를 읽는다. CP949로 저장된 한글 태그와 코멘트·가사·앨범아트까지 직접 읽는다.
enum TagReader {

    static let order = [
        "제목", "아티스트", "앨범", "앨범 아티스트", "장르", "연도", "트랙", "디스크",
        "작곡가", "작사가", "출판사", "BPM", "저작권", "인코딩", "코멘트", "가사",
    ]

    private static let labels: [String: String] = {
        let ids: [[String]] = [
            ["TIT2", "TT2", "제목"], ["TPE1", "TP1", "아티스트"], ["TALB", "TAL", "앨범"],
            ["TPE2", "TP2", "앨범 아티스트"], ["TCON", "TCO", "장르"], ["TDRC", "TYE", "연도"],
            ["TYER", "TYE", "연도"], ["TRCK", "TRK", "트랙"], ["TPOS", "TPA", "디스크"],
            ["TCOM", "TCM", "작곡가"], ["TEXT", "TXT", "작사가"], ["TPUB", "TPB", "출판사"],
            ["TBPM", "TBP", "BPM"], ["TCOP", "TCR", "저작권"], ["TSSE", "TSS", "인코딩"],
            ["COMM", "COM", "코멘트"], ["USLT", "ULT", "가사"],
        ]
        var out: [String: String] = [:]
        for id in ids {
            out[id[0]] = id[2]
            out[id[1]] = id[2]
        }
        return out
    }()

    struct Result {
        var tags: [(String, String)] = []
        var picture: Data?

        func has(_ label: String) -> Bool { tags.contains { $0.0 == label } }
    }

    static func parse(_ input: [UInt8]) -> Result {
        var result = Result()
        var b = input
        if b.count < 10 || !b.matches(0, "ID3") || b[3] < 2 || b[3] > 4 { return result }
        let version = Int(b[3])
        let flags = b[5]
        var end = Int(min(Int64(b.count), 10 + synchsafe(b, 6)))
        if (flags & 0x80) != 0 && version < 4 {
            b = removeUnsync(b, end)
            end = b.count
        }
        var pos = 10
        if (flags & 0x40) != 0 && version >= 3 && end >= 14 {
            pos += version == 4 ? Int(synchsafe(b, 10)) : Int(b.int32BE(10)) + 4
        }
        let headerSize = version == 2 ? 6 : 10
        while pos >= 10 && pos + headerSize <= end && b[pos] != 0 {
            let id = String(bytes: b[pos..<(pos + (version == 2 ? 3 : 4))], encoding: .isoLatin1) ?? ""
            var size: Int64
            var frameFlags = 0
            if version == 2 {
                size = Int64(b[pos + 3]) << 16 | Int64(b[pos + 4]) << 8 | Int64(b[pos + 5])
            } else {
                size = version == 4 ? synchsafe(b, pos + 4) : b.int32BE(pos + 4)
                frameFlags = Int(b[pos + 9])
            }
            let data = pos + headerSize
            if size <= 0 || Int64(data) + size > Int64(end) { break }
            let length = Int(size)
            let opaque = version == 3 ? (frameFlags & 0xC0) != 0 : version == 4 && (frameFlags & 0x0C) != 0
            if !opaque {
                let skip = version == 4 && (frameFlags & 0x01) != 0 ? 4 : 0
                readFrame(&result, id, b, data + skip, length - skip, version)
            }
            pos = data + length
        }
        return result
    }

    private static func readFrame(_ result: inout Result, _ id: String, _ b: [UInt8], _ start: Int, _ length: Int, _ version: Int) {
        if length < 2 { return }
        let encoding = Int(b[start])
        let end = start + length
        if id == "APIC" || id == "PIC" {
            if result.picture != nil { return }
            var p = start + 1
            if id == "PIC" {
                p += 3
            } else {
                while p < end && b[p] != 0 { p += 1 } // MIME
                p += 1
            }
            p += 1 // 그림 종류
            let split = terminator(b, p, end, encoding)
            p = split + width(encoding)
            if p < end { result.picture = Data(b[p..<end]) }
            return
        }
        var label = labels[id]
        var value: String
        if id == "TXXX" || id == "TXX" {
            let split = terminator(b, start + 1, end, encoding)
            label = text(b, start + 1, split, encoding)
            value = text(b, split + width(encoding), end, encoding)
            if label?.lowercased() == "comment" { label = "코멘트" } else if label?.lowercased() == "lyrics" { label = "가사" }
        } else if label == nil {
            return
        } else if id.hasPrefix("T") {
            value = text(b, start + 1, end, encoding)
        } else {
            if length < 5 { return }
            let split = terminator(b, start + 4, end, encoding)
            let description = text(b, start + 4, split, encoding)
            if description.hasPrefix("iTun") { return }
            value = text(b, split + width(encoding), end, encoding)
        }
        if let label = label, !label.isEmpty, !value.isEmpty, !result.has(label) {
            result.tags.append((label, value))
        }
    }

    private static func width(_ encoding: Int) -> Int { encoding == 1 || encoding == 2 ? 2 : 1 }

    private static func terminator(_ b: [UInt8], _ start: Int, _ end: Int, _ encoding: Int) -> Int {
        let step = width(encoding)
        var i = start
        while i + step <= end {
            if b[i] == 0 && (step == 1 || b[i + 1] == 0) { return i }
            i += step
        }
        return end
    }

    private static func text(_ b: [UInt8], _ start: Int, _ end: Int, _ encoding: Int) -> String {
        if start >= end { return "" }
        let bytes = Array(b[start..<end])
        var value: String
        switch encoding {
        case 1:
            if bytes.count >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
                value = String(bytes: bytes[2...], encoding: .utf16LittleEndian) ?? ""
            } else if bytes.count >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
                value = String(bytes: bytes[2...], encoding: .utf16BigEndian) ?? ""
            } else {
                value = String(bytes: bytes, encoding: .utf16BigEndian) ?? ""
            }
        case 2:
            value = String(bytes: bytes, encoding: .utf16BigEndian) ?? ""
        case 3:
            value = String(bytes: bytes, encoding: .utf8) ?? TextDecoding.decode(bytes)
        default:
            // 표준은 Latin-1이지만 국내 파일은 대부분 CP949를 그대로 넣어 두었다.
            value = TextDecoding.decode(bytes)
        }
        while value.hasSuffix("\u{0}") { value.removeLast() }
        return value.replacingOccurrences(of: "\u{0}", with: ", ")
            .replacingOccurrences(of: "\u{FEFF}", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func removeUnsync(_ b: [UInt8], _ end: Int) -> [UInt8] {
        var out = [UInt8]()
        out.reserveCapacity(end)
        var i = 0
        while i < end {
            out.append(b[i])
            if i >= 10 && b[i] == 0xFF && i + 1 < end && b[i + 1] == 0 { i += 1 }
            i += 1
        }
        return out
    }

    private static func synchsafe(_ b: [UInt8], _ i: Int) -> Int64 {
        Int64(b[i] & 0x7F) << 21 | Int64(b[i + 1] & 0x7F) << 14 | Int64(b[i + 2] & 0x7F) << 7 | Int64(b[i + 3] & 0x7F)
    }
}
