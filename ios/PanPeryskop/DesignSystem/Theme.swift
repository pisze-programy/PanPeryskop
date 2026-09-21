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
        static let section: CGFloat = 28
    }

    enum Typo {
        static let sectionTitle = Font.headline.weight(.bold)
        static let sectionLabel = Font.caption.weight(.semibold)
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

        /// Viator colours (green star, mint badge).
        static let partnerGreen = Color(red: 0.23, green: 0.70, blue: 0.49)
        static let partnerMintText = Color(red: 0.05, green: 0.36, blue: 0.23)

        static func partnerMint(_ scheme: ColorScheme) -> Color {
            scheme == .dark
                ? Color(red: 0.09, green: 0.18, blue: 0.14)
                : Color(red: 0.85, green: 0.94, blue: 0.88)
        }

        /// Flight price bands in the month calendar: cheap, average, dear.
        static func priceLow(_ scheme: ColorScheme) -> Color {
            scheme == .dark
                ? Color(red: 0.29, green: 0.87, blue: 0.50)
                : Color(red: 0.08, green: 0.50, blue: 0.24)
        }

        static func priceMid(_ scheme: ColorScheme) -> Color {
            scheme == .dark
                ? Color(red: 0.98, green: 0.75, blue: 0.14)
                : Color(red: 0.71, green: 0.33, blue: 0.04)
        }

        static func priceHigh(_ scheme: ColorScheme) -> Color {
            scheme == .dark
                ? Color(red: 0.97, green: 0.44, blue: 0.44)
                : Color(red: 0.73, green: 0.11, blue: 0.11)
        }
    }
}
