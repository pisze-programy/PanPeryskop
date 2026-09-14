import Foundation
import CoreLocation

/// A trip-planning place from `GET /travel/places` (hotel, attraction, car
/// rental or insurance). Coordinates come from the API; distances are computed
/// on device against the event and the chosen airport.
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
    /// Hotels only (the Ekonomiczne / Polecane / Premium filter).
    let tier: HotelTier?
    let rating: Double?
    let reviews: Int?
}

struct TravelPlacesResponse: Codable {
    let places: [TravelPlace]
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
    /// "320 zł" — price with its currency code, as the provider sent it.
    var priceLabel: String { "\(price) \(currency)" }

    func distanceMeters(to coordinate: CLLocationCoordinate2D) -> CLLocationDistance {
        CLLocation(latitude: lat, longitude: lng)
            .distance(from: CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude))
    }

    /// "850 m" / "12.4 km" — human distance label.
    static func distanceLabel(_ meters: CLLocationDistance) -> String {
        meters < 1000
            ? "\(Int(meters.rounded())) m"
            : String(format: "%.1f km", meters / 1000)
    }

    /// Distance from the event, plus from the arrival airport when known.
    func distancesLabel(event: CLLocationCoordinate2D, airport: CLLocationCoordinate2D?) -> String {
        var parts = ["Wydarzenie: \(Self.distanceLabel(distanceMeters(to: event)))"]
        if let airport {
            parts.append("Lotnisko: \(Self.distanceLabel(distanceMeters(to: airport)))")
        }
        return parts.joined(separator: " · ")
    }
}
