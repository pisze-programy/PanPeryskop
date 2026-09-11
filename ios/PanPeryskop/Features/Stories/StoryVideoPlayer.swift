import SwiftUI
import AVKit

struct StoryVideoPlayer: View {
    let url: URL
    let isActive: Bool
    @Binding var paused: Bool
    let onFinished: () -> Void
    let onStarted: () -> Void
    let onReady: () -> Void
    let onProgress: (Double) -> Void
    @State private var player: AVPlayer?
    @State private var observer: Any?
    @State private var statusObserver: NSKeyValueObservation?
    @State private var timeObserver: NSKeyValueObservation?
    @State private var timeObserverToken: Any?
    @State private var didReportReady = false
    @State private var didReportStarted = false

    var body: some View {
        PlayerLayerView(player: player)
            .allowsHitTesting(false)
            .onAppear {
                guard player == nil else { return }
                let p = AVPlayer(url: url)
                player = p
                observer = NotificationCenter.default.addObserver(
                    forName: .AVPlayerItemDidPlayToEndTime,
                    object: p.currentItem, queue: .main
                ) { _ in Task { @MainActor in onFinished() } }
                if let item = p.currentItem {
                    statusObserver = item.observe(\.status, options: [.initial, .new]) { item, _ in
                        DispatchQueue.main.async {
                            if item.status == .readyToPlay, !didReportReady {
                                didReportReady = true
                                onReady()
                            }
                        }
                    }
                }
                timeObserver = p.observe(\.timeControlStatus, options: [.new]) { player, _ in
                    DispatchQueue.main.async {
                        if player.timeControlStatus == .playing,
                           let item = player.currentItem,
                           item.isPlaybackLikelyToKeepUp,
                           !didReportStarted {
                            didReportStarted = true
                            onStarted()
                        }
                    }
                }
                let interval = CMTime(seconds: 0.25, preferredTimescale: 600)
                timeObserverToken = p.addPeriodicTimeObserver(
                    forInterval: interval, queue: .main
                ) { [weak p] time in
                    guard let p, let item = p.currentItem, item.duration.seconds > 0 else { return }
                    onProgress(min(max(time.seconds / item.duration.seconds, 0), 1))
                }
                if isActive && !paused { p.play() }
            }
            .onDisappear {
                teardown()
            }
            .onChange(of: isActive) { _, active in
                if active && !paused { player?.play() } else { player?.pause() }
            }
            .onChange(of: paused) { _, isPaused in
                if isPaused { player?.pause() } else if isActive { player?.play() }
            }
    }

    private func teardown() {
        player?.pause()
        if let token = timeObserverToken {
            player?.removeTimeObserver(token)
        }
        timeObserverToken = nil
        if let obs = observer {
            NotificationCenter.default.removeObserver(obs)
        }
        observer = nil
        statusObserver?.invalidate()
        statusObserver = nil
        timeObserver?.invalidate()
        timeObserver = nil
        player = nil
        didReportReady = false
        didReportStarted = false
    }
}

/// Bare video layer — no playback controls, no gesture capture. The story's own
/// tap zones (next/prev) keep working and the video just plays in the background.
/// (SwiftUI `VideoPlayer` installs AVKit controls that swallow the taps.)
private struct PlayerLayerView: UIViewRepresentable {
    let player: AVPlayer?

    func makeUIView(context: Context) -> PlayerContainerView {
        let view = PlayerContainerView()
        view.backgroundColor = .clear
        view.playerLayer.videoGravity = .resizeAspect
        view.playerLayer.player = player
        return view
    }

    func updateUIView(_ view: PlayerContainerView, context: Context) {
        view.playerLayer.player = player
    }
}

private final class PlayerContainerView: UIView {
    override static var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}
