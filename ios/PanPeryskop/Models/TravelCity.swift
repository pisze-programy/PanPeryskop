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
    /// R2 key of the lead photo, or nil.
    let imageKey: String?
}

extension TravelCity {
    var imageURL: URL? {
        guard let imageKey else { return nil }
        return URL(string: "\(APIClient.baseURL)/media/\(imageKey)")
    }
}

struct CityConnection: Codable, Equatable {
    let iata: String
    let carriers: [String]
}

struct TravelCitiesResponse: Codable {
    let cities: [TravelCity]
}
