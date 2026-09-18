import Foundation

/// One origin city and its airports. `airports` are IATA codes.
struct CatalogueCity: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let lat: Double
    let lng: Double
    let airports: [String]

    var city: City { City(id: id, name: name, lat: lat, lng: lng) }
}

/// The travel catalogue: cities, airports and per-origin destinations.
/// `version` is the content identity used for conditional requests.
struct TravelCatalogue: Codable {
    let version: String
    let schemaVersion: Int
    let minAppBuild: Int
    let generatedAt: String
    let cities: [CatalogueCity]
    let airports: [Airport]
    let destinations: [String: [Destination]]

    func city(id: String) -> CatalogueCity? {
        cities.first { $0.id == id }
    }

    func originAirports(for cityId: String) -> [Airport] {
        let iatas = city(id: cityId)?.airports ?? []
        return iatas.compactMap { iata in airports.first { $0.iata == iata } }
    }
}

extension TravelCatalogue {
    /// Shipped with the app. Always available, also offline.
    static let bundled: TravelCatalogue = {
        guard let url = Bundle.main.url(forResource: "catalogue", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let catalogue = try? JSONDecoder().decode(TravelCatalogue.self, from: data) else {
            fatalError("catalogue.json missing from the app bundle")
        }
        return catalogue
    }()
}
