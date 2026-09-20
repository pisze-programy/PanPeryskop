import SwiftUI
import UIKit

/// Colour for a run, from light (short/easy, asphalt) to dark (long/hard, trail,
/// ultra). All inputs come from the provider's real `distance`/`distances`,
/// `surface` and `difficulty`.
enum RunPalette {
    /// Two-stop gradient for the map pin: the distance colour and a darker shade.
    static func gradientHex(for event: TravelEvent) -> (UInt32, UInt32) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(color(for: event)).getRed(&r, green: &g, blue: &b, alpha: &a)
        return (hex(r, g, b), hex(r * 0.72, g * 0.72, b * 0.72))
    }

    private static func hex(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> UInt32 {
        let channel: (CGFloat) -> UInt32 = { UInt32(max(0, min(1, $0)) * 255) }
        return (channel(r) << 16) | (channel(g) << 8) | channel(b)
    }

    static func color(for event: TravelEvent) -> Color {
        let t = intensity(for: event)
        let hue = 0.10 - 0.08 * t
        let saturation = 0.70 + 0.20 * t
        let brightness = 0.98 - 0.45 * t
        return Color(hue: hue, saturation: saturation, brightness: brightness)
    }

    private static func intensity(for event: TravelEvent) -> Double {
        let meta = event.metaData
        var t = min(max(maxDistanceKm(meta) / 80.0, 0), 1)
        t = min(1, t + difficultyBoost(meta?.difficulty))
        t = min(1, t + surfaceBoost(meta?.surface))
        return t
    }

    private static func difficultyBoost(_ raw: String?) -> Double {
        switch (raw ?? "").lowercased() {
        case "extreme": return 0.25
        case "hilly", "rolling", "undulating": return 0.12
        default: return 0
        }
    }

    private static func surfaceBoost(_ raw: String?) -> Double {
        switch (raw ?? "").lowercased() {
        case "trail", "terrain", "urban trail": return 0.18
        case "mixed", "track": return 0.08
        default: return 0
        }
    }

    private static func maxDistanceKm(_ meta: TravelEventMeta?) -> Double {
        var values: [Double] = []
        if let distance = meta?.distance { values.append(contentsOf: numbers(distance)) }
        for entry in meta?.distances ?? [] { values.append(contentsOf: numbers(entry)) }
        return values.max() ?? 10
    }

    /// Numbers from a label, with word fallbacks. "100 km" → 100, "ultra marathon"
    /// → 50, "half marathon" → 21.1, "marathon" → 42.2.
    private static func numbers(_ text: String) -> [Double] {
        let parsed = text
            .split(whereSeparator: { !$0.isNumber && $0 != "." && $0 != "," })
            .compactMap { Double($0.replacingOccurrences(of: ",", with: ".")) }
        if !parsed.isEmpty { return parsed }
        let lower = text.lowercased()
        if lower.contains("ultra") { return [50] }
        if lower.contains("half") { return [21.1] }
        if lower.contains("marathon") { return [42.2] }
        return []
    }
}
