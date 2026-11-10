import AVFoundation
import MediaPlayer
import UIKit

/// 기기의 음악 보관함(음악 앱에 동기화된 곡). 안드로이드 LibraryScanner.java에 해당한다.
/// Apple Music 스트리밍·DRM 곡은 파일 주소가 없어 목록에서 뺀다.
enum MediaLibrary {

    static var authorized: Bool { MPMediaLibrary.authorizationStatus() == .authorized }

    static func request(_ done: @escaping (Bool) -> Void) {
        if authorized { done(true); return }
        MPMediaLibrary.requestAuthorization { status in done(status == .authorized) }
    }

    static func scan() -> [[String: Any]] {
        let query = MPMediaQuery.songs()
        query.addFilterPredicate(MPMediaPropertyPredicate(value: false, forProperty: MPMediaItemPropertyIsCloudItem))
        var out: [[String: Any]] = []
        for item in query.items ?? [] {
            guard let url = item.assetURL, !item.hasProtectedAsset else { continue }
            let title = item.title ?? url.lastPathComponent
            let year = (item.value(forProperty: "year") as? NSNumber)?.int64Value ?? 0
            out.append([
                "uri": url.absoluteString,
                "title": title,
                "tag": title,
                "artist": item.artist ?? "",
                "album": item.albumTitle ?? "",
                "albumId": String(item.albumPersistentID),
                "albumArtist": item.albumArtist ?? "",
                "genre": item.genre ?? "",
                "year": year,
                "track": item.albumTrackNumber,
                "added": Int64(item.dateAdded.timeIntervalSince1970),
                "duration": Int64(item.playbackDuration * 1000),
                "dir": "",
            ])
        }
        return out
    }

    static func item(_ uri: String) -> MPMediaItem? {
        guard let comps = URLComponents(string: uri),
              let idText = comps.queryItems?.first(where: { $0.name == "id" })?.value,
              let id = UInt64(idText) else { return nil }
        let query = MPMediaQuery.songs()
        query.addFilterPredicate(MPMediaPropertyPredicate(value: NSNumber(value: id), forProperty: MPMediaItemPropertyPersistentID))
        return query.items?.first
    }

    /// 재생 엔진은 ipod-library 주소를 직접 못 여는 경우가 있어 앱 캐시로 복사해 둔다.
    static func playableURL(_ uri: String) throws -> URL {
        guard let url = URL(string: uri) else { throw StreamError.message("곡을 찾을 수 없습니다.") }
        if (try? AVAudioFile(forReading: url)) != nil { return url }
        let id = URLComponents(string: uri)?.queryItems?.first(where: { $0.name == "id" })?.value ?? ZipLibrary.hash(uri)
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("library", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        for ext in ["caf", "m4a"] {
            let existing = dir.appendingPathComponent("\(id).\(ext)")
            if FileManager.default.fileExists(atPath: existing.path) { return existing }
        }
        let asset = AVURLAsset(url: url)
        var exporter = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough)
        var type = AVFileType.caf
        if exporter == nil || !(exporter!.supportedFileTypes.contains(.caf)) {
            exporter = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A)
            type = .m4a
        }
        guard let session = exporter else { throw StreamError.message("이 곡은 재생할 수 없습니다.") }
        let target = dir.appendingPathComponent("\(id).\(type == .caf ? "caf" : "m4a")")
        let partial = dir.appendingPathComponent("\(id).part.\(type == .caf ? "caf" : "m4a")")
        try? FileManager.default.removeItem(at: partial)
        session.outputURL = partial
        session.outputFileType = type
        let done = DispatchSemaphore(value: 0)
        session.exportAsynchronously { done.signal() }
        done.wait()
        guard session.status == .completed else { throw StreamError.message("이 곡은 재생할 수 없습니다.") }
        try FileManager.default.moveItem(at: partial, to: target)
        return target
    }
}

/// 앨범아트. ID3 태그를 먼저 보고, 없으면 시스템 분석기를 쓴다.
enum Artwork {

    static func image(_ uri: String, maxSize: Int) -> UIImage? {
        if uri.hasPrefix("ipod-library:") {
            let size = CGSize(width: maxSize, height: maxSize)
            return MediaLibrary.item(uri)?.artwork?.image(at: size).map { resize($0, maxSize) }
        }
        guard let data = rawData(uri), let image = UIImage(data: data) else { return nil }
        return resize(image, maxSize)
    }

    static func dataUrl(_ uri: String, maxSize: Int) -> String? {
        guard let image = image(uri, maxSize: maxSize), let jpeg = image.jpegData(compressionQuality: 0.85) else { return nil }
        return "data:image/jpeg;base64," + jpeg.base64EncodedString()
    }

    /// 곡 앞부분. ZIP 안 곡은 ZIP에서 바로 읽는다.
    static func head(_ uri: String) -> [UInt8]? {
        if uri.hasPrefix(ZipLibrary.entryScheme + "://") { return try? ZipLibrary.readHead(uri) }
        if uri.hasPrefix(FolderStore.prefix), let url = try? FolderStore.shared.fileURL(uri),
           let input = try? RegionStream.whole(url) {
            defer { input.close() }
            return try? ZipLibrary.readHead(input, total: Int64.max)
        }
        return nil
    }

    private static func rawData(_ uri: String) -> Data? {
        let head = self.head(uri)
        if let head = head, let picture = TagReader.parse(head).picture { return picture }
        return withAsset(uri, head: head) { asset in
            AVMetadataItem.metadataItems(from: asset.commonMetadata, filteredByIdentifier: .commonIdentifierArtwork).first?.dataValue
        }
    }

    /// 시스템 분석기(AVAsset)로 읽는다. ZIP 안 곡은 앞부분만 임시 파일로 만들어 읽는다.
    static func withAsset<T>(_ uri: String, head: [UInt8]?, _ body: (AVURLAsset) -> T?) -> T? {
        if uri.hasPrefix(FolderStore.prefix), let url = try? FolderStore.shared.fileURL(uri) {
            return body(AVURLAsset(url: url))
        }
        if uri.hasPrefix(ZipLibrary.entryScheme + "://"), let head = head {
            let ext = URL(string: uri)?.pathExtension ?? "mp3"
            let temp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "." + ext)
            guard (try? Data(head).write(to: temp)) != nil else { return nil }
            defer { try? FileManager.default.removeItem(at: temp) }
            return body(AVURLAsset(url: temp))
        }
        if let url = URL(string: uri) { return body(AVURLAsset(url: url)) }
        return nil
    }

    private static func resize(_ image: UIImage, _ maxSize: Int) -> UIImage {
        let longest = max(image.size.width, image.size.height)
        let limit = CGFloat(maxSize)
        guard longest > limit * 1.5 else { return image }
        let scale = limit / longest
        let size = CGSize(width: floor(image.size.width * scale), height: floor(image.size.height * scale))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    }
}
