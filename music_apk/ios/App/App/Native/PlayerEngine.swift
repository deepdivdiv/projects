import AVFoundation
import MediaPlayer
import UIKit

/// 재생 엔진. 백그라운드 재생, 잠금화면·제어 센터, 이어폰 버튼, 이퀄라이저, 배속, 취침 타이머를 담당한다.
/// (안드로이드 PlaybackService.java + EqProcessor.java)
///
/// 소리 경로: 파일 → AVAudioPlayerNode → 10밴드 EQ → 배속(TimePitch) → 출력
final class PlayerEngine {
    static let shared = PlayerEngine()

    struct Track {
        let uri: String
        let title: String
    }

    static let frequencies: [Float] = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    /// 취침 시간이 이만큼 남으면 소리를 서서히 줄인다.
    static let sleepFadeMs: Int64 = 15000

    var onState: (() -> Void)?
    var onError: (() -> Void)?

    private let engine = AVAudioEngine()
    private let node = AVAudioPlayerNode()
    private let eq = AVAudioUnitEQ(numberOfBands: 10)
    private let pitch = AVAudioUnitTimePitch()
    private var format: AVAudioFormat?
    private let resume = ResumeStore()
    private let loader = DispatchQueue(label: "com.snet.musicapk.loader", qos: .userInitiated)

    private(set) var queue: [Track] = []
    private(set) var index = 0
    private var file: AVAudioFile?
    private var segmentStart: AVAudioFramePosition = 0
    private var pausedFrame: AVAudioFramePosition = 0
    private var lastFrame: AVAudioFramePosition = 0
    private var nodePlaying = false
    private(set) var playWhenReady = false
    private var ended = false
    private var generation = 0
    private var loadToken = 0
    private var loading = false
    private var pendingPositionMs: Int64 = 0
    private var interrupted = false
    private var ticks = 0

    private(set) var speed: Float = 1
    var queueFolder: String?
    private var eqEnabled = false
    private var eqGains: [Float] = []
    private var sleepDeadline: Date?
    private(set) var sleepAtEnd = false
    private var ticker: Timer?
    private var sleepTimer: Timer?
    private var artworkUri: String?

    private init() {
        engine.attach(node)
        engine.attach(eq)
        engine.attach(pitch)
        for (i, band) in eq.bands.enumerated() {
            band.filterType = .parametric
            band.frequency = PlayerEngine.frequencies[i]
            band.bandwidth = 1.0 // 한 옥타브 폭
            band.gain = 0
            band.bypass = true
        }
        eq.globalGain = 0
        observe()
        setupRemoteCommands()
    }

    // ---- 상태 ----

    var isEmpty: Bool { queue.isEmpty }
    var currentUri: String? { queue.indices.contains(index) ? queue[index].uri : nil }
    var isPlaying: Bool { playWhenReady && !ended && !queue.isEmpty }

    var durationMs: Int64 {
        guard let f = file, f.processingFormat.sampleRate > 0 else { return 0 }
        return Int64(Double(f.length) / f.processingFormat.sampleRate * 1000)
    }

    var positionMs: Int64 {
        if loading || file == nil { return pendingPositionMs }
        let f = file!
        return Int64(Double(currentFrame()) / f.processingFormat.sampleRate * 1000)
    }

    var sleepLeftMs: Int64 {
        guard let d = sleepDeadline else { return 0 }
        return max(0, Int64(d.timeIntervalSinceNow * 1000))
    }

    private func currentFrame() -> AVAudioFramePosition {
        guard let f = file else { return 0 }
        if nodePlaying, let nodeTime = node.lastRenderTime, nodeTime.isSampleTimeValid,
           let playerTime = node.playerTime(forNodeTime: nodeTime) {
            lastFrame = min(max(0, segmentStart + playerTime.sampleTime), f.length)
            return lastFrame
        }
        return nodePlaying ? lastFrame : pausedFrame
    }

    private func frame(forMs ms: Int64) -> AVAudioFramePosition {
        guard let f = file else { return 0 }
        let frame = AVAudioFramePosition(Double(max(0, ms)) / 1000 * f.processingFormat.sampleRate)
        return min(frame, f.length)
    }

    private func emit() {
        onState?()
    }

    // ---- 목록 ----

    func sameQueue(_ tracks: [Track]) -> Bool {
        !tracks.isEmpty && tracks.count == queue.count && zip(tracks, queue).allSatisfy { $0.uri == $1.uri }
    }

    func setQueue(_ tracks: [Track], index: Int, positionMs: Int64, play: Bool) {
        queue = tracks
        playWhenReady = play
        ended = false
        guard !tracks.isEmpty else {
            stopNode()
            file = nil
            emit()
            return
        }
        load(min(max(0, index), tracks.count - 1), positionMs: positionMs)
    }

    /// index 곡의 position 위치로 간다. 재생 여부는 그대로 둔다.
    func skipTo(_ index: Int, positionMs: Int64) {
        guard queue.indices.contains(index) else { return }
        if index == self.index && file != nil && !loading {
            seek(positionMs)
        } else {
            ended = false
            load(index, positionMs: positionMs)
        }
    }

    private func resolve(_ uri: String) throws -> URL {
        if uri.hasPrefix(FolderStore.prefix) { return try FolderStore.shared.fileURL(uri, download: true) }
        if uri.hasPrefix(ZipLibrary.entryScheme + "://") { return try ZipLibrary.extract(uri) }
        if uri.hasPrefix("ipod-library:") { return try MediaLibrary.playableURL(uri) }
        guard let url = URL(string: uri) else { throw StreamError.message("파일을 찾을 수 없습니다.") }
        return url
    }

    private func load(_ index: Int, positionMs: Int64) {
        loadToken += 1
        let token = loadToken
        stopNode()
        file = nil
        loading = true
        self.index = index
        pendingPositionMs = positionMs
        let uri = queue[index].uri
        let next = index + 1 < queue.count ? queue[index + 1].uri : nil
        updateNowPlaying()
        emit()
        loader.async { [weak self] in
            guard let self = self else { return }
            var opened: AVAudioFile?
            do {
                opened = try AVAudioFile(forReading: self.resolve(uri))
            } catch {
                opened = nil
            }
            DispatchQueue.main.async {
                guard token == self.loadToken else { return }
                self.loading = false
                guard let f = opened else {
                    self.playWhenReady = false
                    self.updateTimers()
                    self.updateNowPlaying()
                    self.emit()
                    self.onError?()
                    return
                }
                self.file = f
                self.configure(f.processingFormat)
                self.pausedFrame = self.frame(forMs: self.pendingPositionMs)
                self.lastFrame = self.pausedFrame
                if self.playWhenReady && !self.ended { self.startNode() }
                self.updateTimers()
                self.updateNowPlaying()
                self.emit()
            }
            // ZIP의 다음 곡은 미리 꺼내 두어 곡이 바뀔 때 끊김을 줄인다.
            if let next = next, next.hasPrefix(ZipLibrary.entryScheme + "://") {
                _ = try? ZipLibrary.extract(next)
            }
        }
    }

    private func configure(_ newFormat: AVAudioFormat) {
        if let old = format, old.sampleRate == newFormat.sampleRate, old.channelCount == newFormat.channelCount { return }
        let wasRunning = engine.isRunning
        if wasRunning { engine.stop() }
        engine.connect(node, to: eq, format: newFormat)
        engine.connect(eq, to: pitch, format: newFormat)
        engine.connect(pitch, to: engine.mainMixerNode, format: newFormat)
        format = newFormat
        applyEq()
    }

    // ---- 재생 ----

    private func startEngine() -> Bool {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [])
        try? session.setActive(true)
        if !engine.isRunning {
            engine.prepare()
            do { try engine.start() } catch { return false }
        }
        return true
    }

    private func startNode() {
        guard let f = file else { return }
        guard startEngine() else {
            playWhenReady = false
            onError?()
            return
        }
        generation += 1
        let gen = generation
        node.stop()
        let start = min(pausedFrame, f.length)
        let count = f.length - start
        if count <= 0 {
            pausedFrame = f.length
            trackEnded()
            return
        }
        segmentStart = start
        lastFrame = start
        pitch.rate = speed
        node.scheduleSegment(f, startingFrame: start, frameCount: AVAudioFrameCount(count), at: nil,
                             completionCallbackType: .dataPlayedBack) { [weak self] _ in
            DispatchQueue.main.async { self?.segmentDone(gen) }
        }
        node.play()
        nodePlaying = true
    }

    private func stopNode() {
        if nodePlaying { pausedFrame = currentFrame() }
        generation += 1
        node.stop()
        nodePlaying = false
    }

    private func segmentDone(_ gen: Int) {
        guard gen == generation, nodePlaying, let f = file else { return }
        nodePlaying = false
        pausedFrame = f.length
        lastFrame = f.length
        trackEnded()
    }

    private func trackEnded() {
        if sleepAtEnd {
            // 이 곡까지만 듣기: 곡 끝에서 멈춘다.
            playWhenReady = false
            ended = true
            setSleep(delayMs: 0, endOfTrack: false)
            saveNow()
            updateTimers()
            updateNowPlaying()
            emit()
            return
        }
        if let uri = currentUri { resume.clear(uri) } // 다음 곡으로 넘어간 곡은 다 들은 곡이다.
        if index + 1 < queue.count {
            load(index + 1, positionMs: 0)
        } else {
            ended = true
            saveNow()
            updateTimers()
            updateNowPlaying()
            emit()
        }
    }

    func play() {
        guard !queue.isEmpty else { return }
        if ended {
            ended = false
            if index + 1 < queue.count && pausedFrame >= (file?.length ?? 0) && file != nil {
                if let uri = currentUri { resume.clear(uri) }
                playWhenReady = true
                load(index + 1, positionMs: 0)
                return
            }
            pausedFrame = 0
        }
        playWhenReady = true
        if loading {
            // 불러오기가 끝나면 재생한다.
        } else if file == nil {
            load(index, positionMs: pendingPositionMs) // 오류 뒤에 다시 시도한다.
        } else if !nodePlaying {
            startNode()
        }
        updateTimers()
        updateNowPlaying()
        emit()
    }

    func pause() {
        playWhenReady = false
        stopNode()
        saveNow()
        updateTimers()
        updateNowPlaying()
        emit()
    }

    func seek(_ ms: Int64) {
        ended = false
        if loading || file == nil {
            pendingPositionMs = ms
            if file == nil && !loading && !queue.isEmpty { load(index, positionMs: ms) }
        } else {
            pausedFrame = frame(forMs: ms)
            lastFrame = pausedFrame
            if nodePlaying || playWhenReady { startNode() }
        }
        saveNow()
        updateNowPlaying()
        emit()
    }

    func setSpeed(_ value: Float) {
        speed = min(max(value, 0.25), 16)
        pitch.rate = speed
        updateNowPlaying()
        emit()
    }

    // ---- 이퀄라이저 ----

    func setEq(enabled: Bool, gains: [Float]) {
        eqEnabled = enabled
        eqGains = gains
        applyEq()
    }

    private func applyEq() {
        let rate = Float(format?.sampleRate ?? 44100)
        var boost: Float = 0
        for (i, band) in eq.bands.enumerated() {
            let gain = i < eqGains.count ? eqGains[i] : 0
            // 나이퀴스트 근처 주파수는 필터가 불안정해진다.
            let active = eqEnabled && abs(gain) >= 0.05 && band.frequency < rate * 0.45
            band.gain = active ? min(max(gain, -24), 24) : 0
            band.bypass = !active
            if active { boost = max(boost, gain) }
        }
        eq.globalGain = eqEnabled ? -min(boost, 24) : 0 // 키운 만큼 낮춰 소리가 찢어지지 않게 한다.
    }

    // ---- 취침 타이머 ----

    func setSleep(delayMs: Int64, endOfTrack: Bool) {
        sleepTimer?.invalidate()
        sleepTimer = nil
        sleepDeadline = delayMs > 0 ? Date().addingTimeInterval(Double(delayMs) / 1000) : nil
        sleepAtEnd = endOfTrack
        engine.mainMixerNode.outputVolume = 1
        if sleepDeadline != nil {
            let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in self?.sleepTick() }
            RunLoop.main.add(timer, forMode: .common)
            sleepTimer = timer
        }
    }

    private func sleepTick() {
        guard sleepDeadline != nil else { return }
        let left = sleepLeftMs
        if left <= 0 {
            pause()
            setSleep(delayMs: 0, endOfTrack: false)
            emit()
            return
        }
        engine.mainMixerNode.outputVolume = left >= PlayerEngine.sleepFadeMs ? 1 : max(0, Float(left) / Float(PlayerEngine.sleepFadeMs))
    }

    // ---- 이어듣기 저장 ----

    func saveNow() {
        guard let uri = currentUri, file != nil || !loading else { return }
        let next = index + 1 < queue.count ? queue[index + 1].uri : nil
        resume.save(folder: queueFolder, uri: uri, position: positionMs, duration: durationMs, nextUri: next)
    }

    private func updateTimers() {
        if isPlaying {
            if ticker == nil {
                let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
                    guard let self = self else { return }
                    self.ticks += 1
                    if self.ticks % 4 == 0 { self.saveNow() }
                    self.emit()
                }
                RunLoop.main.add(timer, forMode: .common)
                ticker = timer
            }
        } else {
            ticker?.invalidate()
            ticker = nil
        }
    }

    // ---- 시스템 연동 ----

    private func observe() {
        let center = NotificationCenter.default
        center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] n in
            guard let self = self, let raw = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            if type == .began {
                if self.playWhenReady {
                    self.interrupted = true
                    self.pause()
                }
            } else {
                let options = AVAudioSession.InterruptionOptions(rawValue: n.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
                if self.interrupted && options.contains(.shouldResume) { self.play() }
                self.interrupted = false
            }
        }
        // 이어폰을 빼면 멈춘다.
        center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] n in
            guard let raw = n.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
            if self?.playWhenReady == true { self?.pause() }
        }
        center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            guard let self = self, self.nodePlaying else { return }
            self.stopNode()
            if self.playWhenReady { self.startNode() }
        }
        center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self else { return }
            let wasPlaying = self.playWhenReady
            self.stopNode()
            self.format = nil
            if let f = self.file { self.configure(f.processingFormat) }
            if wasPlaying { self.startNode() }
        }
        for name in [UIApplication.willResignActiveNotification, UIApplication.didEnterBackgroundNotification, UIApplication.willTerminateNotification] {
            center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in self?.saveNow() }
        }
    }

    private func setupRemoteCommands() {
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.addTarget { [weak self] _ in self?.play(); return .success }
        c.pauseCommand.addTarget { [weak self] _ in self?.pause(); return .success }
        c.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            if self.isPlaying { self.pause() } else { self.play() }
            return .success
        }
        c.nextTrackCommand.addTarget { [weak self] _ in
            guard let self = self, self.index + 1 < self.queue.count else { return .noSuchContent }
            self.skipTo(self.index + 1, positionMs: 0)
            return .success
        }
        c.previousTrackCommand.addTarget { [weak self] _ in
            guard let self = self, !self.queue.isEmpty else { return .noSuchContent }
            // 3초 넘게 들었으면 곡 처음으로, 아니면 이전 곡으로 간다.
            if self.positionMs > 3000 || self.index == 0 { self.seek(0) } else { self.skipTo(self.index - 1, positionMs: 0) }
            return .success
        }
        c.changePlaybackPositionCommand.addTarget { [weak self] e in
            guard let self = self, let e = e as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self.seek(Int64(e.positionTime * 1000))
            return .success
        }
    }

    private func updateNowPlaying() {
        guard let uri = currentUri else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        if artworkUri != uri {
            info.removeValue(forKey: MPMediaItemPropertyArtwork)
            artworkUri = uri
            DispatchQueue.global(qos: .utility).async {
                guard let image = Artwork.image(uri, maxSize: 600) else { return }
                DispatchQueue.main.async {
                    guard self.currentUri == uri else { return }
                    var current = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
                    current[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                    MPNowPlayingInfoCenter.default().nowPlayingInfo = current
                }
            }
        }
        info[MPMediaItemPropertyTitle] = queue[index].title
        info[MPMediaItemPropertyPlaybackDuration] = Double(durationMs) / 1000
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = Double(positionMs) / 1000
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? Double(speed) : 0
        info[MPNowPlayingInfoPropertyDefaultPlaybackRate] = 1.0
        info[MPNowPlayingInfoPropertyPlaybackQueueIndex] = index
        info[MPNowPlayingInfoPropertyPlaybackQueueCount] = queue.count
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
