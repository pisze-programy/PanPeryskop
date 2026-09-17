import Foundation
import CoreLocation

struct TravelPlace: Codable, Identifiable, Equatable {
    let id: String
    let kind: PlaceKind
    let name: String
    let image: String
    let price: Int
    let currency: String
    let address: String
    let lat: Double
    let lng: Double
    let link: String
    let tier: HotelTier?
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
    case hotel
    case attraction
    case car
    case insurance

    var id: String { rawValue }

    var label: String {
        switch self {
        case .hotel: return "Noclegi"
        case .attraction: return "Atrakcje"
        case .car: return "Wynajem samochodu"
        case .insurance: return "Ubezpieczenie"
        }
    }
}

enum HotelTier: String, Codable, CaseIterable {
    case economy
    case recommended
    case premium

    var label: String {
        switch self {
        case .economy: return "Ekonomiczne"
        case .recommended: return "Polecane"
        case .premium: return "Premium"
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

    var priceLabel: String { "\(price) \(currency)" }

    /// Hotels: the API price is per night.
    var nightlyPriceLabel: String { "\(price) \(currency) za noc" }

    func totalPriceLabel(nights: Int) -> String {
        let n = max(nights, 1)
        return "(łącznie \(price * n) \(currency), \(Self.nightsLabel(n)))"
    }

    static func nightsLabel(_ nights: Int) -> String {
        let n = max(nights, 0)
        let last = n % 10
        let lastTwo = n % 100
        if n == 1 { return "1 noc" }
        if (2...4).contains(last) && !(12...14).contains(lastTwo) { return "\(n) noce" }
        return "\(n) nocy"
    }

    func distanceMeters(to coordinate: CLLocationCoordinate2D) -> CLLocationDistance {
        CLLocation(latitude: lat, longitude: lng)
            .distance(from: CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude))
    }

    static func distanceLabel(_ meters: CLLocationDistance) -> String {
        meters < 1000
            ? "\(Int(meters.rounded())) m"
            : String(format: "%.1f km", meters / 1000)
    }

    func distancesLabel(event: CLLocationCoordinate2D, airport: CLLocationCoordinate2D?) -> String {
        var parts = ["Wydarzenie: \(Self.distanceLabel(distanceMeters(to: event)))"]
        if let airport {
            parts.append("Lotnisko: \(Self.distanceLabel(distanceMeters(to: airport)))")
        }
        return parts.joined(separator: " · ")
    }
}
