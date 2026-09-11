import Foundation

// MARK: - Travel (Wycieczki)

extension APIClient {
    /// Travel events within a bbox + day window, optionally reachable from an
    /// origin airport. `from`/`to` are epoch ms.
    static func getTravelEvents(swLat: Double, swLng: Double, neLat: Double, neLng: Double, from: Int64, to: Int64, tag: String?, origin: String? = nil) async throws -> TravelEventsResponse {
        var params = [
            "sw_lat": String(swLat),
            "sw_lng": String(swLng),
            "ne_lat": String(neLat),
            "ne_lng": String(neLng),
            "from": String(from),
            "to": String(to),
            "limit": "1000",
        ]
        if let tag { params["tag"] = tag }
        if let origin { params["origin"] = origin }
        return try await get("/travel/events", params: params)
    }

    /// Flight availability for a route around an event day — shape
    /// `FlightWindow { outbound[], returning[] }` of `{date, hour, price}`.
    static func getFlights(airline: Airline, origin: String, destination: String, eventDay: String) async throws -> FlightWindowResponse {
        let path = airline == .ryanair ? "/travel/flights/ryanair" : "/travel/flights/wizzair"
        return try await get(path, params: ["origin": origin, "destination": destination, "eventDay": eventDay])
    }
}