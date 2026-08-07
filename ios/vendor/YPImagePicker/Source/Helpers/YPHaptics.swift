//
//  YPHaptics.swift
//  YPImagePicker
//
//  Created for PanPeryskop.
//  Copyright © 2026 Yummypets. All rights reserved.
//

import UIKit

/// Haptic feedback for the picker that honours the same global setting as the host
/// app (`settings.hapticsEnabled`), so it can be switched off app-wide.
internal enum YPHaptics {
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

    /// A rapid series of impacts ("bomb") — used for captures and confirmations.
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
}
