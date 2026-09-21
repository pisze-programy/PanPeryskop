import Foundation

struct TravelCity: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let country: String
    let countryCode: String
    let lat: Double
    let lng: Double
    let tier: String
    let tierRank: Int
    let reachable: Bool
    let connections: [CityConnection]
}

struct CityConnection: Codable, Equatable {
    let iata: String
    let carriers: [String]
}

struct TravelCitiesResponse: Codable {
    let cities: [TravelCity]
}
