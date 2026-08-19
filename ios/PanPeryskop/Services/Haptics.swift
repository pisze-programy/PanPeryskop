import SwiftUI
import UIKit

@MainActor
enum Haptics {
    static let enabledKey = "settings.hapticsEnabled"

    static var isEnabled: Bool {
        UserDefaults.standard.object(forKey: enabledKey) as? Bool ?? true
    }

    static func selection() {
        guard isEnabled else { return }
        UISelectionFeedbackGenerator().selectionChanged()
    }

    static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        guard isEnabled else { return }
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    static func success() {
        guard isEnabled else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func error() {
        guard isEnabled else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }

    static func explosion() {
        guard isEnabled else { return }
        Task { @MainActor in
            let generator = UIImpactFeedbackGenerator(style: .light)
            generator.prepare()
            for step in 0..<4 {
                generator.impactOccurred(intensity: 1.0 - Double(step) * 0.2)
                try? await Task.sleep(nanoseconds: 40_000_000)
            }
        }
    }

    private static var tickTask: Task<Void, Never>?

    static func startTickLoop(interval: UInt64 = 400_000_000) {
        guard isEnabled, tickTask == nil else { return }
        tickTask = Task { @MainActor in
            let generator = UIImpactFeedbackGenerator(style: .light)
            generator.prepare()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: interval)
                guard !Task.isCancelled else { return }
                generator.impactOccurred(intensity: 0.5)
            }
        }
    }

    static func stopTickLoop() {
        tickTask?.cancel()
        tickTask = nil
    }

    // MARK: - Day slider haptics
    // A dedicated, REUSED generator with a minimum interval between fires. Calling
    // UIImpactFeedbackGenerator faster than the system allows makes iOS silently
    // drop haptics (a known bug during fast slider drags) — the throttle prevents it.

    private static let sliderGenerator = UIImpactFeedbackGenerator(style: .rigid)
    private static let rigidGenerator = UIImpactFeedbackGenerator(style: .rigid)
    private static let minorGenerator = UIImpactFeedbackGenerator(style: .medium)
    private static var lastSliderFire: TimeInterval = 0
    private static var lastMinorFire: TimeInterval = 0
    private static let sliderMinInterval: TimeInterval = 0.07
    private static let minorMinInterval: TimeInterval = 0.03

    /// Detent haptic per tick, intensity scales with how far the drag jumped
    /// (fast drags feel stronger).
    static func sliderTick(intensity: CGFloat) {
        guard isEnabled else { return }
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastSliderFire >= sliderMinInterval else { return }
        lastSliderFire = now
        sliderGenerator.impactOccurred(intensity: min(max(intensity, 0), 1))
    }

    /// Soft detent fired when the drag crosses a minor graduation (the thin ticks
    /// between days) — so the user feels each sub-step, not just whole days.
    static func sliderMinor(steps: Int = 1) {
        guard isEnabled else { return }
        let now = ProcessInfo.processInfo.systemUptime
        for _ in 0..<steps {
            guard now - lastMinorFire >= minorMinInterval else { return }
            lastMinorFire = now
            minorGenerator.impactOccurred(intensity: 0.85)
        }
    }

    /// "Wall" haptic fired when the user drags past the range at either end.
    static func sliderWall() {
        guard isEnabled else { return }
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastSliderFire >= 0.12 else { return }
        lastSliderFire = now
        rigidGenerator.impactOccurred(intensity: 1.0)
    }
}
