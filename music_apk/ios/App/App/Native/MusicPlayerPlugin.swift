import AVFoundation
import Capacitor
import Photos
import UIKit
import UniformTypeIdentifiers

/// 화면(www/bridge.js)과 재생 엔진을 잇는 플러그인. 안드로이드 MusicPlayerPlugin.java와 같은 메서드를 제공한다.
@objc(MusicPlayerPlugin)
public class MusicPlayerPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "MusicPlayerPlugin"
    public let jsName = "MusicPlayer"
    public let pluginMethods: [CAPPluginMethod] = [
        "hasAccess", "setTheme", "requestAccess", "removeFolder", "getLibrary", "requestAudio", "getSystemFonts",
        "requestNotifications", "listDir", "getArt", "getThumb", "getTags", "saveText", "shareFile", "saveImage",
        "pickText", "shareText", "setQueue", "play", "pause", "seekTo", "setSpeed", "getResume", "setSleep", "setEq", "skipTo",
    ].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }

    private static let thumbSize = 144
    private static let maxImportBytes = 10 * 1024 * 1024

    private let player = PlayerEngine.shared
    private let resume = ResumeStore()
    private let work = DispatchQueue(label: "com.snet.musicapk.work", qos: .userInitiated, attributes: .concurrent)
    private let thumbs: OperationQueue = {
        let q = OperationQueue()
        q.maxConcurrentOperationCount = 2
        q.qualityOfService = .utility
        return q
    }()

    private enum PickMode { case folder, text }
    private var pickMode: PickMode?
    private var pickCall: CAPPluginCall?

    override public func load() {
        player.onState = { [weak self] in self?.emitState() }
        player.onError = { [weak self] in self?.notifyListeners("playError", data: [:]) }
    }

    private func emitState() {
        guard !player.isEmpty else { return }
        var state: [String: Any] = [
            "index": player.index,
            "position": Int(player.positionMs),
            "duration": Int(max(player.durationMs, 0)),
            "speed": Double(player.speed),
            "sleepLeft": Int(player.sleepLeftMs),
            "sleepEnd": player.sleepAtEnd,
            "playing": player.isPlaying,
        ]
        if let uri = player.currentUri { state["uri"] = uri }
        notifyListeners("state", data: state)
    }

    /// Capacitor로 넘기기 전에 Int64 같은 값을 자바스크립트가 받는 형태로 바꾼다.
    private static func js(_ value: Any) -> Any {
        switch value {
        case let v as [String: Any]: return v.mapValues { js($0) }
        case let v as [[String: Any]]: return v.map { $0.mapValues { js($0) } }
        case let v as [[String: String]]: return v
        case let v as [Any]: return v.map { js($0) }
        case let v as Int64: return Int(v)
        case let v as Int32: return Int(v)
        case let v as UInt64: return String(v)
        case let v as Float: return Double(v)
        default: return value
        }
    }

    private func resolve(_ call: CAPPluginCall, _ data: [String: Any]) {
        call.resolve(MusicPlayerPlugin.js(data) as? [String: Any] ?? [:])
    }

    private func onMain(_ body: @escaping () -> Void) {
        if Thread.isMainThread { body() } else { DispatchQueue.main.async(execute: body) }
    }

    // ---- 권한과 폴더 연결 ----

    private func accessResult() -> [String: Any] {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        return ["granted": FolderStore.shared.hasConnected || appFolderHasMusic(), "store": true, "version": version]
    }

    /// 파일 앱으로 앱 폴더에 음악을 넣어 두었으면 폴더를 연결하지 않아도 바로 쓸 수 있다.
    private func appFolderHasMusic() -> Bool {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: FolderStore.documents.path)) ?? []
        return names.contains { !$0.hasPrefix(".") && $0 != MusicPlayerPlugin.exportFolder }
    }

    @objc func hasAccess(_ call: CAPPluginCall) {
        resolve(call, accessResult())
    }

    @objc func setTheme(_ call: CAPPluginCall) {
        let dark = call.getBool("dark", true)
        let color = UIColor(hex: call.getString("color", "#000000"))
        onMain {
            if let vc = self.bridge?.viewController as? MainViewController {
                vc.lightContent = dark
                vc.view.backgroundColor = color
                vc.setNeedsStatusBarAppearanceUpdate()
            }
            self.bridge?.webView?.backgroundColor = color
            self.bridge?.webView?.scrollView.backgroundColor = color
            call.resolve()
        }
    }

    /// 파일 앱에서 음악 폴더를 고른다. 앱을 다시 켜도 쓸 수 있도록 북마크로 저장한다.
    @objc func requestAccess(_ call: CAPPluginCall) {
        onMain {
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
            picker.allowsMultipleSelection = false
            self.present(picker, mode: .folder, call: call)
        }
    }

    @objc func removeFolder(_ call: CAPPluginCall) {
        if let tree = call.getString("tree") { FolderStore.shared.disconnect(tree) }
        resolve(call, accessResult())
    }

    private func present(_ picker: UIDocumentPickerViewController, mode: PickMode, call: CAPPluginCall) {
        if let old = pickCall { old.resolve(["cancelled": true]) }
        pickMode = mode
        pickCall = call
        picker.delegate = self
        bridge?.viewController?.present(picker, animated: true)
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pickCall, let mode = pickMode else { return }
        pickCall = nil
        pickMode = nil
        switch mode {
        case .folder:
            for url in urls { try? FolderStore.shared.connect(url) }
            resolve(call, accessResult())
        case .text:
            guard let url = urls.first else { call.resolve(["cancelled": true]); return }
            work.async {
                let accessing = url.startAccessingSecurityScopedResource()
                defer { if accessing { url.stopAccessingSecurityScopedResource() } }
                guard let data = try? Data(contentsOf: url) else { call.reject("파일을 읽지 못했습니다."); return }
                if data.count > MusicPlayerPlugin.maxImportBytes { call.reject("파일이 너무 큽니다."); return }
                call.resolve(["text": String(decoding: data, as: UTF8.self)])
            }
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard let call = pickCall, let mode = pickMode else { return }
        pickCall = nil
        pickMode = nil
        if mode == .folder { resolve(call, accessResult()) } else { call.resolve(["cancelled": true]) }
    }

    // ---- 음악 보관함 ----

    @objc func getLibrary(_ call: CAPPluginCall) {
        work.async {
            if !MediaLibrary.authorized {
                call.resolve(["denied": true])
                return
            }
            self.resolve(call, ["tracks": MediaLibrary.scan()])
        }
    }

    @objc func requestAudio(_ call: CAPPluginCall) {
        MediaLibrary.request { granted in call.resolve(["granted": granted]) }
    }

    /// 안드로이드 삼성 글꼴용 기능이다. iOS WebView는 시스템 글꼴을 그대로 쓴다.
    @objc func getSystemFonts(_ call: CAPPluginCall) {
        call.resolve(["fonts": [Any]()])
    }

    /// 재생 알림은 잠금화면·제어 센터에 자동으로 나오므로 따로 권한이 필요 없다.
    @objc func requestNotifications(_ call: CAPPluginCall) {
        call.resolve()
    }

    // ---- 파일 탐색 ----

    @objc func listDir(_ call: CAPPluginCall) {
        let path = call.getString("path")
        work.async {
            do {
                let result = try FolderStore.shared.list(path) { [weak self] in
                    self?.notifyListeners("zipBusy", data: [:])
                }
                self.resolve(call, result)
            } catch {
                call.reject(error.localizedDescription.isEmpty ? "폴더를 읽지 못했습니다." : error.localizedDescription)
            }
        }
    }

    // ---- 앨범아트 ----

    @objc func getArt(_ call: CAPPluginCall) {
        let uri = call.getString("uri") ?? ""
        work.async {
            if let url = Artwork.dataUrl(uri, maxSize: 800) { call.resolve(["dataUrl": url]) } else { call.resolve() }
        }
    }

    /// 리스트용 작은 앨범아트. 한 번 만든 결과는 앨범아트가 없다는 사실까지 저장해 둔다.
    @objc func getThumb(_ call: CAPPluginCall) {
        let uri = call.getString("uri") ?? ""
        let size = call.getInt("size") ?? MusicPlayerPlugin.thumbSize
        thumbs.addOperation {
            let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("thumbs", isDirectory: true)
            let cached = dir.appendingPathComponent("\(ZipLibrary.hash(uri))_\(size)")
            var dataUrl: String
            if let text = try? String(contentsOf: cached, encoding: .utf8) {
                dataUrl = text
            } else {
                dataUrl = Artwork.dataUrl(uri, maxSize: size) ?? ""
                try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                try? dataUrl.write(to: cached, atomically: true, encoding: .utf8)
            }
            if dataUrl.isEmpty { call.resolve() } else { call.resolve(["dataUrl": dataUrl]) }
        }
    }

    // ---- 태그 ----

    @objc func getTags(_ call: CAPPluginCall) {
        let uri = call.getString("uri") ?? ""
        work.async {
            var tags: [(String, String)] = []
            var tech: [[String: String]] = []
            var result: [String: Any] = [:]
            func add(_ label: String, _ value: String?) {
                guard let v = value?.trimmingCharacters(in: .whitespacesAndNewlines), !v.isEmpty,
                      !tags.contains(where: { $0.0 == label }) else { return }
                tags.append((label, v))
            }

            let head = Artwork.head(uri)
            if let head = head { tags = TagReader.parse(head).tags }

            if uri.hasPrefix("ipod-library:"), let item = MediaLibrary.item(uri) {
                add("제목", item.title)
                add("아티스트", item.artist)
                add("앨범", item.albumTitle)
                add("앨범 아티스트", item.albumArtist)
                add("장르", item.genre)
                if item.albumTrackNumber > 0 { add("트랙", String(item.albumTrackNumber)) }
                if item.discNumber > 0 { add("디스크", String(item.discNumber)) }
                add("작곡가", item.composer)
                add("가사", item.lyrics)
                result["path"] = "음악 보관함"
            } else {
                _ = Artwork.withAsset(uri, head: head) { asset -> Bool? in
                    for meta in asset.commonMetadata {
                        guard let key = meta.commonKey else { continue }
                        let value = meta.stringValue
                        switch key {
                        case .commonKeyTitle: add("제목", value)
                        case .commonKeyArtist: add("아티스트", value)
                        case .commonKeyAlbumName: add("앨범", value)
                        case .commonKeyType: add("장르", value)
                        case .commonKeyCreationDate: add("연도", value)
                        case .commonKeyCreator: add("작곡가", value)
                        case .commonKeyPublisher: add("출판사", value)
                        case .commonKeyCopyrights: add("저작권", value)
                        case .commonKeySoftware: add("인코딩", value)
                        default: break
                        }
                    }
                    return true
                }
            }

            // 기술 정보
            let ext = (URL(string: uri)?.pathExtension ?? uri.components(separatedBy: ".").last ?? "").lowercased()
            if !ext.isEmpty && !uri.hasPrefix("ipod-library:") { tech.append(["label": "형식", "value": ext.uppercased()]) }
            if uri.hasPrefix(FolderStore.prefix), let url = try? FolderStore.shared.fileURL(uri) {
                let size = FolderStore.fileSize(url)
                result["size"] = Int(size)
                result["path"] = MusicPlayerPlugin.plainPath(uri)
                if let file = try? AVAudioFile(forReading: url) {
                    let rate = file.fileFormat.sampleRate
                    let seconds = rate > 0 ? Double(file.length) / file.processingFormat.sampleRate : 0
                    if seconds > 0 && size > 0 { tech.append(["label": "비트레이트", "value": "\(Int(Double(size) * 8 / seconds / 1000)) kbps"]) }
                    if rate > 0 { tech.append(["label": "샘플레이트", "value": "\(Int(rate)) Hz"]) }
                    tech.append(["label": "채널", "value": file.fileFormat.channelCount == 1 ? "모노" : "\(file.fileFormat.channelCount)채널"])
                }
            } else if uri.hasPrefix(ZipLibrary.entryScheme + "://") {
                if let info = try? ZipLibrary.describe(uri) {
                    result["path"] = MusicPlayerPlugin.plainPath(info.source) + " › " + info.title
                }
                if let entry = try? ZipLibrary.openEntry(uri) {
                    result["size"] = Int(entry.size)
                    entry.reader.close()
                }
            }

            var list: [[String: String]] = []
            for label in TagReader.order {
                if let t = tags.first(where: { $0.0 == label }) { list.append(["label": t.0, "value": t.1]) }
            }
            for t in tags where !TagReader.order.contains(t.0) { list.append(["label": t.0, "value": t.1]) }
            result["tags"] = list
            result["tech"] = tech
            self.resolve(call, result)
        }
    }

    /// bm:<id>/폴더/파일 → 폴더/파일
    static func plainPath(_ path: String) -> String {
        guard path.hasPrefix(FolderStore.prefix) else { return path }
        let comps = path.dropFirst(FolderStore.prefix.count).components(separatedBy: "/")
        return comps.dropFirst().joined(separator: "/")
    }

    // ---- 내보내기 ----

    static let exportFolder = "내보내기"

    private static func safeName(_ name: String) -> String {
        name.components(separatedBy: CharacterSet(charactersIn: "\\/:*?\"<>|")).joined(separator: "_")
    }

    /// 파일 앱의 '나의 iPhone > DIV AUDIO APP > 내보내기'에 저장한다.
    @objc func saveText(_ call: CAPPluginCall) {
        let name = MusicPlayerPlugin.safeName(call.getString("name", "bookmarks.txt"))
        let text = call.getString("text", "")
        work.async {
            do {
                let dir = FolderStore.documents.appendingPathComponent(MusicPlayerPlugin.exportFolder, isDirectory: true)
                try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                try Data(text.utf8).write(to: dir.appendingPathComponent(name), options: .atomic)
                call.resolve(["path": "\(FolderStore.appName)/\(MusicPlayerPlugin.exportFolder)/\(name)"])
            } catch {
                call.reject("파일을 저장하지 못했습니다.")
            }
        }
    }

    /// 백업 파일이나 발췌 이미지를 다른 앱으로 보낸다.
    @objc func shareFile(_ call: CAPPluginCall) {
        let name = MusicPlayerPlugin.safeName(call.getString("name", "share"))
        let base64 = call.getString("data")
        let text = call.getString("text", "")
        work.async {
            do {
                let dir = FileManager.default.temporaryDirectory.appendingPathComponent("shared", isDirectory: true)
                try? FileManager.default.removeItem(at: dir)
                try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                let file = dir.appendingPathComponent(name)
                let data = base64.flatMap { Data(base64Encoded: $0, options: .ignoreUnknownCharacters) } ?? Data(text.utf8)
                try data.write(to: file)
                self.share([file], call: call)
            } catch {
                call.reject("공유하지 못했습니다.")
            }
        }
    }

    @objc func shareText(_ call: CAPPluginCall) {
        share([call.getString("text", "")], call: call, subject: call.getString("title", ""))
    }

    private func share(_ items: [Any], call: CAPPluginCall, subject: String? = nil) {
        onMain {
            guard let vc = self.bridge?.viewController else { call.reject("공유하지 못했습니다."); return }
            let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
            if let subject = subject { sheet.setValue(subject, forKey: "subject") }
            if let pop = sheet.popoverPresentationController { // 아이패드
                pop.sourceView = vc.view
                pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.midY, width: 0, height: 0)
                pop.permittedArrowDirections = []
            }
            vc.present(sheet, animated: true)
            call.resolve()
        }
    }

    /// 발췌 이미지를 사진 앱에 저장한다.
    @objc func saveImage(_ call: CAPPluginCall) {
        guard let data = Data(base64Encoded: call.getString("data", ""), options: .ignoreUnknownCharacters) else {
            call.reject("이미지를 저장하지 못했습니다.")
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                call.reject("사진 접근을 허용해 주세요. (설정 > DIV AUDIO APP > 사진)")
                return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil)
            }) { ok, _ in
                if ok { call.resolve() } else { call.reject("이미지를 저장하지 못했습니다.") }
            }
        }
    }

    /// 백업 파일을 사용자가 골라서 읽는다.
    @objc func pickText(_ call: CAPPluginCall) {
        onMain {
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.plainText, .json, .data], asCopy: true)
            self.present(picker, mode: .text, call: call)
        }
    }

    // ---- 재생 ----

    @objc func setQueue(_ call: CAPPluginCall) {
        let raw = call.options["tracks"] as? [[String: Any]] ?? []
        let tracks = raw.map { PlayerEngine.Track(uri: $0["uri"] as? String ?? "", title: $0["title"] as? String ?? "") }
        let index = call.getInt("index") ?? 0
        let position = Int64(call.getDouble("position") ?? 0)
        let play = call.getBool("play", false)
        let folder = call.getString("folder")
        onMain {
            self.player.saveNow() // 목록을 바꾸기 전에 지금 곡의 위치를 남긴다.
            self.player.queueFolder = folder
            if let folder = folder { self.resume.rememberFolder(folder) }
            if self.player.sameQueue(tracks) {
                if play {
                    self.player.skipTo(index, positionMs: position)
                    self.player.play()
                }
                self.emitState() // 앱을 다시 열어도 재생 중인 곡을 끊지 않는다.
            } else {
                self.player.setQueue(tracks, index: index, positionMs: position, play: play)
            }
            call.resolve()
        }
    }

    @objc func play(_ call: CAPPluginCall) {
        onMain { self.player.play(); call.resolve() }
    }

    @objc func pause(_ call: CAPPluginCall) {
        onMain { self.player.pause(); call.resolve() }
    }

    @objc func seekTo(_ call: CAPPluginCall) {
        let position = Int64(call.getDouble("position") ?? 0)
        onMain { self.player.seek(position); call.resolve() }
    }

    @objc func skipTo(_ call: CAPPluginCall) {
        let index = call.getInt("index") ?? 0
        let position = Int64(call.getDouble("position") ?? 0)
        onMain { self.player.skipTo(index, positionMs: position); call.resolve() }
    }

    @objc func setSpeed(_ call: CAPPluginCall) {
        let speed = Float(call.getDouble("speed") ?? 1)
        onMain { self.player.setSpeed(speed); call.resolve() }
    }

    @objc func setSleep(_ call: CAPPluginCall) {
        let delay = Int64(call.getDouble("delay") ?? 0)
        let end = call.getBool("endOfTrack", false)
        onMain {
            self.player.setSleep(delayMs: delay, endOfTrack: end)
            self.emitState()
            call.resolve()
        }
    }

    @objc func setEq(_ call: CAPPluginCall) {
        let gains = (call.options["gains"] as? [Any] ?? []).map { Float(($0 as? NSNumber)?.doubleValue ?? 0) }
        let enabled = call.getBool("enabled", false)
        onMain { self.player.setEq(enabled: enabled, gains: gains); call.resolve() }
    }

    /// 폴더의 마지막 곡과 곡별 들은 위치를 돌려준다.
    @objc func getResume(_ call: CAPPluginCall) {
        let folder = call.getString("folder", "")
        let uris = call.options["uris"] as? [String] ?? []
        var positions: [String: Any] = [:]
        for uri in uris {
            let p = resume.position(uri)
            if p > 0 { positions[uri] = Int(p) }
        }
        var result: [String: Any] = ["positions": positions]
        if let last = resume.lastUri(folder) { result["uri"] = last }
        if let lastFolder = resume.lastFolder() { result["lastFolder"] = lastFolder }
        call.resolve(result)
    }
}

extension UIColor {
    convenience init(hex: String) {
        var text = hex.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("#") { text.removeFirst() }
        if text.count == 3 { text = text.map { "\($0)\($0)" }.joined() }
        let value = UInt64(text, radix: 16) ?? 0
        if text.count == 8 { // #AARRGGBB (안드로이드 형식)
            self.init(red: CGFloat((value >> 16) & 0xFF) / 255, green: CGFloat((value >> 8) & 0xFF) / 255,
                      blue: CGFloat(value & 0xFF) / 255, alpha: CGFloat((value >> 24) & 0xFF) / 255)
        } else {
            self.init(red: CGFloat((value >> 16) & 0xFF) / 255, green: CGFloat((value >> 8) & 0xFF) / 255,
                      blue: CGFloat(value & 0xFF) / 255, alpha: 1)
        }
    }
}
