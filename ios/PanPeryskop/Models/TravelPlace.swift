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
    var priceLabel: String { "\(price) \(currency)" }

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
