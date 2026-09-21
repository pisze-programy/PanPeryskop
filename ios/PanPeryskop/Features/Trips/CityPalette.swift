import SwiftUI
import UIKit

/// Colour identity for a city break. The gradient runs from the country colour to
/// a lighter shade of it; the tier sets how much lighter the far end is, so a
/// metropolis stays saturated and a smaller city fades out.
enum CityPalette {
    /// Country colour, then the tier-lightened end. Left to right.
    static func gradient(countryCode: String, tier: String) -> [Color] {
        let base = base(countryCode: countryCode)
        return [base, lighten(base, by: lightenAmount(tier))]
    }

    static func base(countryCode: String) -> Color {
        Color(hex: countryColors[countryCode.uppercased()] ?? fallback)
    }

    private static let fallback: UInt32 = 0x4F46E5

    private static let countryColors: [String: UInt32] = [
        "DE": 0x1F4E9C,
        "FR": 0x2A5BD7,
        "IT": 0x1E8E4E,
        "ES": 0xD1482F,
        "NL": 0xE07B2A,
        "PL": 0xC8324B,
        "CH": 0xD64545,
        "BE": 0xB07A2A,
        "PT": 0x1F8A70,
        "AT": 0xA3344F,
        "SE": 0x2E6FA8,
        "IE": 0x2FA36B,
        "FI": 0x3A7CA5,
        "RO": 0xD9A33B,
        "HR": 0x2B9EB3,
        "EL": 0x2C8FB5,
        "BG": 0x3F8E4A,
        "NO": 0x2B4C7E,
        "CZ": 0x4C5BC7,
        "HU": 0x6E8E3F,
        "MT": 0xE07A5F,
        "LV": 0x7A4B8E,
        "EE": 0x5171A5,
        "SK": 0x4A7A96,
        "LT": 0x5E8C4A,
        "SI": 0x2E9E8F,
    ]

    private static func lightenAmount(_ tier: String) -> CGFloat {
        switch tier {
        case "metropolis": return 0.22
        case "large": return 0.34
        default: return 0.46
        }
    }

    private static func lighten(_ color: Color, by amount: CGFloat) -> Color {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return Color(
            red: min(1, red + (1 - red) * amount),
            green: min(1, green + (1 - green) * amount),
            blue: min(1, blue + (1 - blue) * amount)
        )
    }
}
