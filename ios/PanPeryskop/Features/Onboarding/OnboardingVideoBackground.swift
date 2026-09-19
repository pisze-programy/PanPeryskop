import SwiftUI
import AVFoundation

/// Full-screen looping video for the onboarding background. Muted, aspect-fill,
/// paused while the app is in the background.
struct OnboardingVideoBackground: UIViewRepresentable {
    let resource: String

    func makeUIView(context: Context) -> PlayerView {
        let view = PlayerView()
        view.start(resource: resource)
        return view
    }

    func updateUIView(_ uiView: PlayerView, context: Context) {}

    static func dismantleUIView(_ uiView: PlayerView, coordinator: ()) {
        uiView.stop()
    }

    final class PlayerView: UIView {
        private let playerLayer = AVPlayerLayer()
        private var player: AVQueuePlayer?
        private var looper: AVPlayerLooper?
        private var observers: [NSObjectProtocol] = []

        override init(frame: CGRect) {
            super.init(frame: frame)
            playerLayer.videoGravity = .resizeAspectFill
            layer.addSublayer(playerLayer)
            observeLifecycle()
        }

        required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

        override func layoutSubviews() {
            super.layoutSubviews()
            playerLayer.frame = bounds
        }

        func start(resource: String) {
            guard let url = Bundle.main.url(forResource: resource, withExtension: "mp4") else { return }
            let item = AVPlayerItem(asset: AVURLAsset(url: url))
            let queue = AVQueuePlayer()
            queue.isMuted = true
            looper = AVPlayerLooper(player: queue, templateItem: item)
            playerLayer.player = queue
            player = queue
            queue.play()
        }

        func stop() {
            player?.pause()
            playerLayer.player = nil
            observers.forEach(NotificationCenter.default.removeObserver)
            observers.removeAll()
        }

        private func observeLifecycle() {
            let center = NotificationCenter.default
            observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
                self?.player?.pause()
            })
            observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
                self?.player?.play()
            })
        }
    }
}
