import Foundation

/// Visual identity for a travel-event pin: the gradient and the glyph. A match
/// takes both team colours, a run takes its distance palette.
struct TravelPinStyle: Codable, Equatable {
    let icon: String
    let startHex: UInt32
    let endHex: UInt32
}

enum PinHex {
    /// "990000" or "#990000" → value; nil when malformed or near-white (a white
    /// pin would vanish on the map).
    static func value(_ raw: String?) -> UInt32? {
        guard var text = raw?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), !text.isEmpty else { return nil }
        if text.hasPrefix("#") { text.removeFirst() }
        guard text.count == 6, let value = UInt32(text, radix: 16) else { return nil }
        let r = (value >> 16) & 0xFF
        let g = (value >> 8) & 0xFF
        let b = value & 0xFF
        if r > 230 && g > 230 && b > 230 { return nil }
        return value
    }
}
