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
}
