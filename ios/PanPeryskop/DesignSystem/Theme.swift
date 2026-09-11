import SwiftUI

/// Design tokens — the single source of truth for spacing, radii and semantic
/// colors. Views must not hardcode these values.
enum Theme {
    /// 4-pt spacing scale.
    enum Spacing {
        static let xs: CGFloat = 4
        static let s: CGFloat = 8
        static let m: CGFloat = 12
        static let l: CGFloat = 16
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
    }

    enum Radius {
        static let chip: CGFloat = 8
        static let card: CGFloat = 12
        static let sheet: CGFloat = 16
    }

    enum Palette {
        /// Neutral badge/tag text — adapts to the color scheme.
        static func neutral(_ scheme: ColorScheme) -> Color {
            scheme == .dark
                ? Color(red: 0.75, green: 0.76, blue: 0.78)
                : Color(red: 0.35, green: 0.36, blue: 0.38)
        }

        static let surface = Color(.systemGray6)
        static let surfaceRaised = Color(.systemGray5)
        static let hairline = Color.white.opacity(0.2)
        static let shadow = Color.black.opacity(0.15)
    }
}
