import Foundation

/// 사용자가 파일 앱에서 연결한 폴더와 앱 자체 폴더(Documents)를 탐색기처럼 읽는다.
/// (안드로이드 스토어 버전의 TreeBrowser.java)
///
/// 화면에 넘기는 경로: bm:<연결 id>/<연결한 폴더 이름>/<하위 경로>
/// ZIP은 앞에 zipfile:을 붙여 폴더와 구분한다.
final class FolderStore {
    static let shared = FolderStore()

    static let prefix = "bm:"
    static let zipPrefix = "zipfile:"
    static let appId = "app"
    static let appName = "DIV AUDIO APP"
    private static let slowCount = 20
    private static let foldersKey = "connectedFolders"

    private struct Root {
        let id: String
        let name: String
        let bookmark: Data?
    }

    private let lock = NSLock()
    private var opened: [String: URL] = [:]
    private var durations: [String: Int64]?

    /// 앱 폴더. 파일 앱의 '나의 iPhone > DIV AUDIO APP'에 보인다.
    static var documents: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    // ---- 연결 목록 ----

    private func storedRoots() -> [Root] {
        let list = UserDefaults.standard.array(forKey: FolderStore.foldersKey) as? [[String: Any]] ?? []
        return list.compactMap { d in
            guard let id = d["id"] as? String, let name = d["name"] as? String, let data = d["bookmark"] as? Data else { return nil }
            return Root(id: id, name: name, bookmark: data)
        }
    }

    private func saveRoots(_ roots: [Root]) {
        UserDefaults.standard.set(roots.map { ["id": $0.id, "name": $0.name, "bookmark": $0.bookmark ?? Data()] as [String: Any] }, forKey: FolderStore.foldersKey)
    }

    var hasConnected: Bool { !storedRoots().isEmpty }

    /// 문서 선택기에서 고른 폴더를 저장한다. 앱을 다시 켜도 쓸 수 있도록 북마크로 남긴다.
    func connect(_ url: URL) throws {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        let bookmark = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
        let id = ZipLibrary.hash(url.standardizedFileURL.path)
        var roots = storedRoots().filter { $0.id != id }
        roots.append(Root(id: id, name: url.lastPathComponent, bookmark: bookmark))
        saveRoots(roots)
        lock.lock()
        if let old = opened.removeValue(forKey: id) { old.stopAccessingSecurityScopedResource() }
        lock.unlock()
    }

    func disconnect(_ id: String) {
        saveRoots(storedRoots().filter { $0.id != id })
        lock.lock()
        if let old = opened.removeValue(forKey: id) { old.stopAccessingSecurityScopedResource() }
        lock.unlock()
    }

    private func rootURL(_ id: String) throws -> URL {
        if id == FolderStore.appId { return FolderStore.documents }
        lock.lock()
        defer { lock.unlock() }
        if let url = opened[id] { return url }
        guard let root = storedRoots().first(where: { $0.id == id }), let data = root.bookmark else {
            throw StreamError.message("폴더 연결이 끊겼습니다. 다시 연결해 주세요.")
        }
        var stale = false
        guard let url = try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale) else {
            throw StreamError.message("폴더를 찾을 수 없습니다. 다시 연결해 주세요.")
        }
        // 앱이 켜져 있는 동안은 연결을 계속 열어 둔다.
        _ = url.startAccessingSecurityScopedResource()
        if stale, let fresh = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
            saveRoots(storedRoots().map { $0.id == id ? Root(id: id, name: $0.name, bookmark: fresh) : $0 })
        }
        opened[id] = url
        return url
    }

    // ---- 경로 ----

    private struct Parsed {
        let id: String
        let rootName: String
        let parts: [String]
        var path: String { FolderStore.prefix + ([id, rootName] + parts).joined(separator: "/") }
    }

    private func parse(_ path: String) throws -> Parsed {
        guard path.hasPrefix(FolderStore.prefix) else { throw StreamError.message("폴더를 찾을 수 없습니다.") }
        let comps = path.dropFirst(FolderStore.prefix.count).components(separatedBy: "/")
        guard comps.count >= 2 else { throw StreamError.message("폴더를 찾을 수 없습니다.") }
        let parts = Array(comps.dropFirst(2)).filter { !$0.isEmpty }
        if parts.contains(where: { $0 == ".." || $0 == "." }) { throw StreamError.message("잘못된 경로입니다.") }
        return Parsed(id: comps[0], rootName: comps[1], parts: parts)
    }

    /// 화면 경로를 실제 파일 주소로 바꾼다. download면 iCloud에만 있는 파일을 받아 온다(오래 걸릴 수 있다).
    func fileURL(_ path: String, download: Bool = false) throws -> URL {
        let p = try parse(path)
        var url = try rootURL(p.id)
        for part in p.parts { url.appendPathComponent(part) }
        if download { try FolderStore.ensureLocal(url) }
        return url
    }

    static func isFolderPath(_ path: String) -> Bool { path.hasPrefix(prefix) }

    static func ensureLocal(_ url: URL) throws {
        let values = try? url.resourceValues(forKeys: [.isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey])
        guard values?.isUbiquitousItem == true, values?.ubiquitousItemDownloadingStatus != .current else { return }
        var coordinatorError: NSError?
        var failure: Error?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinatorError) { _ in }
        if let e = coordinatorError { failure = e }
        if let failure = failure { throw StreamError.message("iCloud에서 파일을 받지 못했습니다: \(failure.localizedDescription)") }
    }

    func parent(_ path: String) -> String {
        guard let p = try? parse(path), !p.parts.isEmpty else { return "" }
        return Parsed(id: p.id, rootName: p.rootName, parts: Array(p.parts.dropLast())).path
    }

    func crumbs(_ path: String) -> [[String: String]] {
        var out = [["name": "내 폴더", "path": ""]]
        guard let p = try? parse(path) else { return out }
        out.append(["name": p.rootName, "path": Parsed(id: p.id, rootName: p.rootName, parts: []).path])
        for i in 0..<p.parts.count {
            out.append(["name": p.parts[i], "path": Parsed(id: p.id, rootName: p.rootName, parts: Array(p.parts[0...i])).path])
        }
        return out
    }

    // ---- 목록 ----

    static func empty(_ path: String, _ name: String) -> [String: Any] {
        ["path": path, "name": name, "dirs": [Any](), "zips": [Any](), "eggs": [Any](), "unplayable": [Any](), "tracks": [Any]()]
    }

    func list(_ path: String?, onSlow: @escaping () -> Void) throws -> [String: Any] {
        guard let path = path, !path.isEmpty else { return listRoots() }
        if path.hasPrefix(ZipLibrary.pathPrefix) { return listZip(try ZipLibrary.load(path)) }
        if path.hasPrefix(FolderStore.zipPrefix) {
            let ref = String(path.dropFirst(FolderStore.zipPrefix.count))
            let url = try fileURL(ref)
            let size = FolderStore.fileSize(url)
            return listZip(try ZipLibrary.open(ZipLibrary.Source(name: url.lastPathComponent, size: size, ref: ref), onSlow: onSlow))
        }
        return try listDir(path, onSlow: onSlow)
    }

    private func listRoots() -> [String: Any] {
        var dirs: [[String: Any]] = [[
            "name": FolderStore.appName + " (앱 폴더)",
            "path": Parsed(id: FolderStore.appId, rootName: FolderStore.appName, parts: []).path,
            "count": 0,
        ]]
        for root in storedRoots() {
            dirs.append([
                "name": root.name,
                "path": Parsed(id: root.id, rootName: root.name, parts: []).path,
                "tree": root.id,
                "count": 0,
            ])
        }
        var out = FolderStore.empty("", "내 폴더")
        out["isRoot"] = true
        out["crumbs"] = [["name": "내 폴더", "path": ""]]
        out["dirs"] = dirs
        return out
    }

    private func listZip(_ zip: [String: Any]) -> [String: Any] {
        let source = zip["source"] as? String
        let parentPath = source.map { FolderStore.isFolderPath($0) ? parent($0) : "" }
        var crumbs = parentPath.map { $0.isEmpty ? [] : self.crumbs($0) } ?? []
        crumbs.append(["name": zip["name"] as? String ?? "", "path": zip["path"] as? String ?? ""])
        var out = FolderStore.empty(zip["path"] as? String ?? "", zip["name"] as? String ?? "")
        out["zip"] = true
        out["tracks"] = zip["tracks"]
        out["crumbs"] = crumbs
        if let parentPath = parentPath, !parentPath.isEmpty { out["parent"] = parentPath }
        return out
    }

    static func fileSize(_ url: URL) -> Int64 {
        Int64((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
    }

    private struct Child {
        let name: String
        let url: URL
        let isDir: Bool
        let size: Int64
    }

    private func listDir(_ path: String, onSlow: @escaping () -> Void) throws -> [String: Any] {
        let p = try parse(path)
        let dirURL = try fileURL(path)
        let keys: [URLResourceKey] = [.isDirectoryKey, .fileSizeKey]
        let urls: [URL]
        do {
            urls = try FileManager.default.contentsOfDirectory(at: dirURL, includingPropertiesForKeys: keys, options: [])
        } catch {
            throw StreamError.message(p.id == FolderStore.appId ? "폴더를 찾을 수 없습니다." : "폴더 연결이 끊겼습니다. 다시 연결해 주세요.")
        }
        var children: [Child] = []
        for url in urls {
            var name = url.lastPathComponent
            // iCloud에 있고 아직 받지 않은 파일은 .이름.icloud 로 보인다.
            if name.hasPrefix(".") && name.hasSuffix(".icloud") {
                name = String(name.dropFirst().dropLast(7))
                children.append(Child(name: name, url: dirURL.appendingPathComponent(name), isDir: false, size: 0))
                continue
            }
            if name.hasPrefix(".") { continue }
            let values = try? url.resourceValues(forKeys: Set(keys))
            children.append(Child(name: name, url: url, isDir: values?.isDirectory == true, size: Int64(values?.fileSize ?? 0)))
        }
        children.sort { naturalLess($0.name, $1.name) }

        var dirs: [[String: Any]] = [], zips: [[String: Any]] = [], eggs: [[String: Any]] = [], unplayable: [[String: Any]] = []
        var audio: [(child: Child, path: String)] = []
        for c in children {
            let link = Parsed(id: p.id, rootName: p.rootName, parts: p.parts + [c.name]).path
            if c.isDir {
                dirs.append(["name": c.name, "path": link, "count": 0])
            } else if ZipLibrary.isZip(c.name) {
                zips.append(["name": c.name, "path": FolderStore.zipPrefix + link, "size": c.size])
            } else if c.name.lowercased().hasSuffix(".egg") {
                eggs.append(["name": c.name, "size": c.size])
            } else if ZipLibrary.isAudio(c.name) {
                audio.append((c, link))
            } else if ZipLibrary.isUnplayableAudio(c.name) {
                unplayable.append(["name": c.name, "size": c.size])
            }
        }
        let crumbs = self.crumbs(path)
        var out = FolderStore.empty(path, crumbs.last?["name"] ?? p.rootName)
        out["crumbs"] = crumbs
        out["parent"] = parent(path)
        out["dirs"] = dirs
        out["zips"] = zips
        out["eggs"] = eggs
        out["unplayable"] = unplayable
        out["tracks"] = tracks(audio, onSlow: onSlow)
        return out
    }

    private func tracks(_ audio: [(child: Child, path: String)], onSlow: () -> Void) -> [[String: Any]] {
        var cache = loadDurations()
        var lengths = [Int64](repeating: 0, count: audio.count)
        var missing: [Int] = []
        for (i, a) in audio.enumerated() {
            if let known = cache[a.path + "|" + String(a.child.size)] { lengths[i] = known } else if a.child.size > 0 { missing.append(i) }
        }
        if missing.count >= FolderStore.slowCount { onSlow() }
        if !missing.isEmpty {
            // 곡 앞부분만 읽지만 곡이 많으면 시간이 걸려서 나눠서 읽고, 결과는 저장해 둔다.
            let results = UnsafeMutableBufferPointer<Int64>.allocate(capacity: missing.count)
            results.initialize(repeating: 0)
            DispatchQueue.concurrentPerform(iterations: missing.count) { k in
                let c = audio[missing[k]].child
                if let input = try? RegionStream.whole(c.url) {
                    results[k] = (try? AudioProbe.durationMs(input, size: c.size, name: c.name)) ?? 0
                    input.close()
                }
            }
            for (k, i) in missing.enumerated() {
                lengths[i] = results[k]
                if results[k] > 0 { cache[audio[i].path + "|" + String(audio[i].child.size)] = results[k] }
            }
            results.deallocate()
            saveDurations(cache)
        }
        return audio.enumerated().map { i, a -> [String: Any] in
            ["uri": a.path, "title": ZipLibrary.stripExtension(a.child.name), "duration": lengths[i]]
        }
    }

    private var durationsURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("durations.plist")
    }

    private func loadDurations() -> [String: Int64] {
        lock.lock()
        defer { lock.unlock() }
        if let d = durations { return d }
        var loaded: [String: Int64] = [:]
        if let data = try? Data(contentsOf: durationsURL),
           let dict = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: NSNumber] {
            loaded = dict.mapValues { $0.int64Value }
        }
        durations = loaded
        return loaded
    }

    private func saveDurations(_ cache: [String: Int64]) {
        lock.lock()
        durations = cache
        lock.unlock()
        let base = durationsURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        if let data = try? PropertyListSerialization.data(fromPropertyList: cache.mapValues { NSNumber(value: $0) }, format: .binary, options: 0) {
            try? data.write(to: durationsURL, options: .atomic)
        }
    }
}
