import Foundation

struct TravelPlace: Codable, Identifiable, Equatable {
    let id: String
    let kind: PlaceKind
    let name: String
    let image: String
    let price: Int
    let currency: String
    let link: String
    let rating: Double?
    let reviews: Int?
    let source: String?
    let durationMinutes: Int?
    let badges: [String]?
}

struct TravelPlacesResponse: Codable {
    let places: [TravelPlace]
    let total: Int
    let hasMore: Bool
}

enum PlaceKind: String, Codable, CaseIterable, Identifiable {
    case attraction

    var id: String { rawValue }

    var label: String {
        switch self {
        case .attraction: return "Atrakcje"
        }
    }
}

extension TravelPlace {
    var url: URL? { URL(string: link) }

    var isPartner: Bool { source == "viator" }

    var priceAmountLabel: String { "\(price) \(currencySymbol)" }

    var fromPriceLabel: String { "od \(priceAmountLabel)" }

    private var currencySymbol: String {
        currency.uppercased() == "PLN" ? "zł" : currency.uppercased()
    }

    var durationLabel: String? {
        guard let minutes = durationMinutes, minutes > 0 else { return nil }
        let hours = minutes / 60
        let rest = minutes % 60
        if hours == 0 { return "\(rest) min" }
        if rest == 0 { return "\(hours) godz." }
        return "\(hours) godz. \(rest) min"
    }

    var badgeLabel: String? {
        guard let badges, let first = badges.first else { return nil }
        switch first {
        case "best_seller": return "Bestseller"
        case "special_offer": return "Oferta specjalna"
        case "new": return "Nowość"
        case "skip_line": return "Bez kolejki"
        case "private": return "Prywatna"
        default: return nil
        }
    }

    var hasFreeCancellation: Bool { badges?.contains("free_cancellation") ?? false }

    var isBestSeller: Bool { badges?.contains("best_seller") ?? false }

    var ratingLabel: String? {
        guard let rating else { return nil }
        let value = String(format: "%.1f", rating)
        guard let reviews else { return value }
        return "\(value) (\(reviews))"
    }
}
