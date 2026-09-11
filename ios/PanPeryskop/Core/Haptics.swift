import SwiftUI
import UIKit
import CoreHaptics

@MainActor
enum Haptics {
    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }

    /// Drum roll: taps that start slow and weak, then speed up and get stronger
    /// and crisper, ending with a double final accent. Played via the CoreHaptics
    /// pattern player; falls back to a UIKit tick loop when unsupported.
    static func drumRoll() {
        Task { @MainActor in
            guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else {
                await tickRollFallback()
                return
            }
            do {
                let engine = try sharedHapticEngine()
                try await engine.start()

                let taps = 12
                let startInterval: TimeInterval = 0.12
                let endInterval: TimeInterval = 0.045
                var events: [CHHapticEvent] = []
                var t: TimeInterval = 0

                for i in 0..<taps {
                    let progress = Double(i) / Double(taps - 1)
                    let intensity = 0.6 + 0.4 * progress
                    let sharpness = 0.45 + 0.55 * progress
                    events.append(CHHapticEvent(
                        eventType: .hapticTransient,
                        parameters: [
                            CHHapticEventParameter(parameterID: .hapticIntensity, value: Float(intensity)),
                            CHHapticEventParameter(parameterID: .hapticSharpness, value: Float(sharpness)),
                        ],
                        relativeTime: t
                    ))
                    // Quadratic speed-up: slow at the start, fast at the end.
                    let interval = startInterval - (startInterval - endInterval) * (progress * progress)
                    t += interval
                }

                // Double final accent — the "ba-dum" ending.
                events.append(CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.9),
                    ],
                    relativeTime: t + 0.05
                ))
                events.append(CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.95),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 1.0),
                    ],
                    relativeTime: t + 0.14
                ))

                let pattern = try CHHapticPattern(events: events, parameters: [])
                try engine.makePlayer(with: pattern).start(atTime: 0)
            } catch {
                await tickRollFallback()
            }
        }
    }

    /// The CoreHaptics engine must stay alive while a pattern plays. A local
    /// engine is deallocated the moment the Task ends — which cut the roll short.
    /// Keep one shared engine for the whole app.
    private static var hapticEngine: CHHapticEngine?

    private static func sharedHapticEngine() throws -> CHHapticEngine {
        if let engine = hapticEngine { return engine }
        let engine = try CHHapticEngine()
        engine.playsHapticsOnly = true
        hapticEngine = engine
        return engine
    }

    private static func tickRollFallback() async {
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.prepare()
        let taps = 12
        let startInterval: TimeInterval = 0.12
        let endInterval: TimeInterval = 0.045
        for i in 0..<taps {
            let progress = Double(i) / Double(taps - 1)
            let interval = startInterval - (startInterval - endInterval) * (progress * progress)
            generator.impactOccurred(intensity: 0.6 + CGFloat(progress) * 0.4)
            try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
        }
        generator.impactOccurred(intensity: 1.0)
        try? await Task.sleep(nanoseconds: 90_000_000)
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred(intensity: 1.0)
    }

    static func explosion() {
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
        guard tickTask == nil else { return }
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
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastSliderFire >= sliderMinInterval else { return }
        lastSliderFire = now
        sliderGenerator.impactOccurred(intensity: min(max(intensity, 0), 1))
    }

    /// Soft detent fired when the drag crosses a minor graduation (the thin ticks
    /// between days) — so the user feels each sub-step, not just whole days.
    static func sliderMinor(steps: Int = 1) {
        let now = ProcessInfo.processInfo.systemUptime
        for _ in 0..<steps {
            guard now - lastMinorFire >= minorMinInterval else { return }
            lastMinorFire = now
            minorGenerator.impactOccurred(intensity: 0.85)
        }
    }

    /// "Wall" haptic fired when the user drags past the range at either end.
    static func sliderWall() {
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastSliderFire >= 0.12 else { return }
        lastSliderFire = now
        rigidGenerator.impactOccurred(intensity: 1.0)
    }
}
