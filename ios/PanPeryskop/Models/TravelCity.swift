import Foundation

struct TravelCity: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let namePl: String
    let country: String
    let countryCode: String
    let lat: Double
    let lng: Double
    /// 1 = the most expensive band. Drives the zoom ladder and the pin ring.
    let bandRank: Int
    let costUsd: Int
    let population: Int
    let imageUrl: String
    let imageLargeUrl: String
    let videoUrl: String?
    let nearby: [String]
    let next: [String]
    let similar: [String]
    let facts: CityFacts
    /// The airports that serve the city, independent of the selected day.
    let airports: [String]
    let reachable: Bool
    let connections: [CityConnection]
}

struct CityFacts: Codable, Equatable {
    let costLocalUsd: Int
    let internetMbps: Int
    let tempNowC: Double
    let humidityNow: Int
    let airQualityNow: Int
    let airQualityYear: Int
    let safety: Double?
    let cleanliness: Double?
    let fun: Double?
    let nightlife: Double?
    let walkability: Double?
    let healthcare: Double?
    let english: Double?
    let lgbtFriendly: Double?
    let femaleFriendly: Double?
    let overall: Double?
}

extension TravelCity {
    var displayName: String { namePl.isEmpty ? name : namePl }
    var heroURL: URL? { URL(string: imageLargeUrl) }
    var pinURL: URL? { URL(string: imageUrl) }

    func countryName(language: String) -> String {
        CountryNames.name(countryCode, language: language) ?? country
    }
}

struct CityConnection: Codable, Equatable {
    let iata: String
    let carriers: [String]
}

struct TravelCitiesResponse: Codable {
    let cities: [TravelCity]
}
