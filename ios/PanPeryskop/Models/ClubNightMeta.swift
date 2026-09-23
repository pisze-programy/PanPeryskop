import Foundation

struct ClubNightMeta: Decodable {
    let lineup: [String]?
    let genres: [String]?
    let venue: String?
    let capacity: Int?
    let price: Int?
    let minimumAge: Int?
    let isTicketed: Bool?

    var lineupText: String? {
        guard let lineup, !lineup.isEmpty else { return nil }
        return lineup.joined(separator: " · ")
    }

    var genresText: String? {
        guard let genres, !genres.isEmpty else { return nil }
        return genres.joined(separator: " · ")
    }

    var ageText: String? {
        guard let minimumAge, minimumAge > 18 else { return nil }
        return "od \(minimumAge) lat"
    }

    var priceText: String? {
        guard let price, price > 0 else { return nil }
        return "od \(price) zł"
    }
}
