import Foundation

extension Airline {
    var displayName: String {
        switch self {
        case .ryanair: return "Ryanair"
        case .wizzair: return "Wizzair"
        }
    }

    func bookingURL(origin: String, destination: String, outbound: String?, returning: String?) -> URL? {
        switch (outbound, returning) {
        case let (out?, back?):
            return legs(from: origin, to: destination, dateOut: out, dateIn: back)
        case let (out?, nil):
            return legs(from: origin, to: destination, dateOut: out, dateIn: nil)
        case let (nil, back?):
            return legs(from: destination, to: origin, dateOut: back, dateIn: nil)
        default:
            return nil
        }
    }

    private func legs(from: String, to: String, dateOut: String, dateIn: String?) -> URL? {
        switch self {
        case .ryanair: return Self.ryanairURL(from: from, to: to, dateOut: dateOut, dateIn: dateIn)
        case .wizzair: return Self.wizzairURL(from: from, to: to, dateOut: dateOut, dateIn: dateIn)
        }
    }

    private static func ryanairURL(from: String, to: String, dateOut: String, dateIn: String?) -> URL? {
        let isReturn = dateIn != nil
        let dateInValue = dateIn ?? ""
        var components = URLComponents(string: "https://www.ryanair.com/pl/pl/trip/flights/select")!
        components.queryItems = [
            URLQueryItem(name: "adults", value: "1"),
            URLQueryItem(name: "teens", value: "0"),
            URLQueryItem(name: "children", value: "0"),
            URLQueryItem(name: "infants", value: "0"),
            URLQueryItem(name: "dateOut", value: dateOut),
            URLQueryItem(name: "dateIn", value: dateInValue),
            URLQueryItem(name: "isConnectedFlight", value: "false"),
            URLQueryItem(name: "discount", value: "0"),
            URLQueryItem(name: "promoCode", value: ""),
            URLQueryItem(name: "isReturn", value: isReturn ? "true" : "false"),
            URLQueryItem(name: "originIata", value: from),
            URLQueryItem(name: "destinationIata", value: to),
            URLQueryItem(name: "tpAdults", value: "1"),
            URLQueryItem(name: "tpTeens", value: "0"),
            URLQueryItem(name: "tpChildren", value: "0"),
            URLQueryItem(name: "tpInfants", value: "0"),
            URLQueryItem(name: "tpStartDate", value: dateOut),
            URLQueryItem(name: "tpEndDate", value: dateInValue),
            URLQueryItem(name: "tpDiscount", value: "0"),
            URLQueryItem(name: "tpPromoCode", value: ""),
            URLQueryItem(name: "tpOriginIata", value: from),
            URLQueryItem(name: "tpDestinationIata", value: to),
        ]
        return components.url
    }

    private static func wizzairURL(from: String, to: String, dateOut: String, dateIn: String?) -> URL? {
        let path = ["https://wizzair.com/pl-pl/booking/select-flight", from, to, dateOut, dateIn]
            .compactMap { $0 }
            .joined(separator: "/")
        return URL(string: path)
    }
}
