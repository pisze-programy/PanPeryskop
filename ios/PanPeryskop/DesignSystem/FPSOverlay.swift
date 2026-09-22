import SwiftUI
import QuartzCore
struct FPSOverlay: View {
    @State private var fps = 0

    var body: some View {
        Text("\(fps) fps")
            .font(.system(size: 10, weight: .semibold, design: .monospaced))
            .foregroundColor(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(Color.black.opacity(0.45), in: Capsule())
            .onAppear { FPSMonitor.shared.start { fps = $0 } }
            .onDisappear { FPSMonitor.shared.stop() }
    }
}

@MainActor
final class FPSMonitor {
    static let shared = FPSMonitor()

    private var link: CADisplayLink?
    private var last = CACurrentMediaTime()
    private var frames = 0
    private var handler: ((Int) -> Void)?

    func start(_ handler: @escaping (Int) -> Void) {
        self.handler = handler
        guard link == nil else { return }
        last = CACurrentMediaTime()
        frames = 0
        let link = CADisplayLink(target: self, selector: #selector(tick))
        link.add(to: .main, forMode: .common)
        self.link = link
    }

    func stop() {
        link?.invalidate()
        link = nil
        handler = nil
    }

    @objc private func tick() {
        frames += 1
        let now = CACurrentMediaTime()
        let elapsed = now - last
        guard elapsed >= 0.5 else { return }
        handler?(Int((Double(frames) / elapsed).rounded()))
        frames = 0
        last = now
    }
}
