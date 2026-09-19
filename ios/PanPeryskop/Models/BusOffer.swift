import Foundation

/// One bus offer between the origin city and the event city.
struct BusOffer: Decodable, Identifiable {
    let price: Int
    let hour: String
    let durationMinutes: Int
    let transfers: Int
    let departureCityId: String
    let arrivalCityId: String

    var id: String { "\(departureCityId)|\(arrivalCityId)|\(hour)|\(price)" }
}

struct BusCity: Decodable {
    let id: String
    let name: String
    let lat: Double?
    let lng: Double?
    let isNode: Bool
}

struct BusWindowResponse: Decodable {
    let offers: [BusOffer]
    let from: BusCity?
    let to: BusCity?
    let bookUrl: String?
    let available: Bool?
}
