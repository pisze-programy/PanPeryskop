import Foundation
import CoreLocation

/// A place from `GET /travel/places`. Distances are computed on device.
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
}

struct TravelPlacesResponse: Codable {
    let places: [TravelPlace]
    let total: Int
    let hasMore: Bool
}

enum PlaceKind: String, Codable, CaseIterable {
    case hotel
    case attraction
    case car
    case insurance

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
