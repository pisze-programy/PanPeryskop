import Foundation

/// One bus offer between the origin city and the event city.
struct BusOffer: Decodable, Identifiable, Equatable {
    let price: Int
    let hour: String
    let durationMinutes: Int
    let transfers: Int
    let departureCityId: String
    let arrivalCityId: String

    var id: String { "\(departureCityId)|\(arrivalCityId)|\(hour)|\(price)|\(durationMinutes)|\(transfers)" }
}

struct BusCity: Decodable, Equatable {
    let id: String
    let name: String
    let lat: Double?
    let lng: Double?
    let isNode: Bool
}

struct BusWindowResponse: Decodable, Equatable {
    let offers: [BusOffer]
    let from: BusCity?
    let to: BusCity?
    let bookUrl: String?
    let available: Bool?
}
