import Foundation

struct FlightOption: Hashable, Identifiable {
    let destination: Destination
    let carrier: Airline

    var id: String { "\(destination.iata)|\(carrier.rawValue)" }
}
