import SwiftUI
import UIKit
enum CityPalette {
    static func gradient(countryCode: String, bandRank: Int) -> [Color] {
        let base = base(countryCode: countryCode)
        return [base, lighten(base, by: lightenAmount(bandRank))]
    }

    static func base(countryCode: String) -> Color {
        Color(hex: countryColors[countryCode.uppercased()] ?? fallback)
    }

    private static let fallback: UInt32 = 0x4F46E5

    private static let countryColors: [String: UInt32] = [
        "AL": 0xB03A3A, "AD": 0xC77A2B, "AM": 0xA8446B, "AT": 0xA3344F,
        "AZ": 0x2E8B7A, "BA": 0x3A6FA8, "BE": 0xB07A2A, "BG": 0x3F8E4A,
        "BY": 0x9C3B4A, "CH": 0xD64545, "CY": 0xD08A2C, "CZ": 0x4C5BC7,
        "DE": 0x1F4E9C, "DK": 0xC0455A, "EE": 0x5171A5, "ES": 0xD1482F,
        "FI": 0x3A7CA5, "FR": 0x2A5BD7, "GB": 0x33478F, "GE": 0xA8483A,
        "GI": 0xB5623A, "GR": 0x2C8FB5, "HR": 0x2B9EB3, "HU": 0x6E8E3F,
        "IE": 0x2FA36B, "IS": 0x3F6E9E, "IT": 0x1E8E4E, "JE": 0xB8552F,
        "XK": 0x3E6EA5, "LT": 0x5E8C4A, "LU": 0x4A8CC0, "LV": 0x7A4B8E,
        "MC": 0xC95A5A, "MD": 0x5C7A3F, "ME": 0xB0463E, "MK": 0xC25A32,
        "MT": 0xE07A5F, "NL": 0xE07B2A, "NO": 0x2B4C7E, "PL": 0xC8324B,
        "PT": 0x1F8A70, "RO": 0xD9A33B, "RS": 0x8E3B4A, "RU": 0x39598F,
        "SE": 0x2E6FA8, "SI": 0x2E9E8F, "SK": 0x4A7A96, "TR": 0xC0392B,
        "UA": 0x4A7FC1, "VA": 0xC0A24A,
    ]

    private static func lightenAmount(_ bandRank: Int) -> CGFloat {
        let clamped = min(max(bandRank, 1), 5)
        return 0.20 + CGFloat(clamped - 1) * 0.065
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
