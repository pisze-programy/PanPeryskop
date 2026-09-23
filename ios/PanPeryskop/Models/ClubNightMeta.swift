import Foundation

/// The fields a club night carries: the lineup, the genres, the club, the age
/// limit and the price. They arrive as JSON in `Post.meta` for the club sources
/// only. Every field is optional, because a source may send a part of them.
struct ClubNightMeta: Decodable {
    let lineup: [String]?
    let genres: [String]?
    let venue: String?
    /// The club's own size. A signal for the sort, never shown.
    let capacity: Int?
    /// The entry price in zloty. Nil when the night is free, or the price is
    /// unknown — the card then shows no price at all.
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

    /// "od 18 lat", or nil. The age shows only above 18: almost every club night
    /// is 18 plus, and a line that never changes is a line nobody reads.
    var ageText: String? {
        guard let minimumAge, minimumAge > 18 else { return nil }
        return "od \(minimumAge) lat"
    }

    /// "od 30 zł", or nil. A free night shows nothing.
    var priceText: String? {
        guard let price, price > 0 else { return nil }
        return "od \(price) zł"
    }
}
