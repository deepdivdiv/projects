import Foundation

/// 곡별 들은 위치와 폴더별 마지막 곡을 저장한다. (안드로이드 ResumeStore.java)
final class ResumeStore {
    /// 곡이 이만큼 남았으면 다 들은 것으로 본다.
    static let endMarginMs: Int64 = 3000

    private let prefs = UserDefaults(suiteName: "resume") ?? .standard

    static func finished(_ position: Int64, _ duration: Int64) -> Bool {
        duration > 0 && position >= duration - endMarginMs
    }

    static func positionToKeep(_ position: Int64, _ duration: Int64) -> Int64 {
        finished(position, duration) ? 0 : max(position, 0)
    }

    /// 다 들었으면 다음에 열 때 다음 곡부터 시작하도록 nextUri를 마지막 곡으로 둔다.
    func save(folder: String?, uri: String, position: Int64, duration: Int64, nextUri: String?) {
        let kept = ResumeStore.positionToKeep(position, duration)
        if kept > 0 { prefs.set(NSNumber(value: kept), forKey: "p:" + uri) } else { prefs.removeObject(forKey: "p:" + uri) }
        if let folder = folder {
            prefs.set(ResumeStore.finished(position, duration) && nextUri != nil ? nextUri! : uri, forKey: "f:" + folder)
            prefs.set(folder, forKey: "last")
        }
    }

    func clear(_ uri: String) { prefs.removeObject(forKey: "p:" + uri) }

    func rememberFolder(_ folder: String) { prefs.set(folder, forKey: "last") }

    func position(_ uri: String) -> Int64 { (prefs.object(forKey: "p:" + uri) as? NSNumber)?.int64Value ?? 0 }

    func lastUri(_ folder: String) -> String? { prefs.string(forKey: "f:" + folder) }

    func lastFolder() -> String? { prefs.string(forKey: "last") }
}
