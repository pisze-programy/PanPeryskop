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
    /// R2 keys of the hero gallery, in order.
    let imageKeys: [String]
    /// R2 key of the map-pin image, or nil.
    let thumbKey: String?
}

extension TravelCity {
    var imageURLs: [URL] { imageKeys.compactMap { Self.mediaURL($0) } }
    var thumbURL: URL? { thumbKey.flatMap { Self.mediaURL($0) } }

    private static func mediaURL(_ key: String) -> URL? {
        URL(string: "\(APIClient.baseURL)/media/\(key)")
    }
}

struct CityConnection: Codable, Equatable {
    let iata: String
    let carriers: [String]
}

struct TravelCitiesResponse: Codable {
    let cities: [TravelCity]
}
