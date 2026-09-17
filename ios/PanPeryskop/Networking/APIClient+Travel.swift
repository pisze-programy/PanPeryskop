import Foundation

// MARK: - Travel (Wycieczki)

extension APIClient {
    /// Travel events within a bbox + day window, optionally reachable from an
    /// origin airport. `from`/`to` are epoch ms.
    static func getTravelEvents(swLat: Double, swLng: Double, neLat: Double, neLng: Double, from: Int64, to: Int64, tags: String?, origin: String? = nil) async throws -> TravelEventsResponse {
        var params = [
            "sw_lat": String(swLat),
            "sw_lng": String(swLng),
            "ne_lat": String(neLat),
            "ne_lng": String(neLng),
            "from": String(from),
            "to": String(to),
            "limit": "1000",
        ]
        if let tags { params["tags"] = tags }
        if let origin { params["origin"] = origin }
        return try await get("/travel/events", params: params)
    }

    /// Flight availability for a route around an event day — shape
    /// `FlightWindow { outbound[], returning[] }` of `{date, hour, price}`.
    static func getFlights(airline: Airline, origin: String, destination: String, eventDay: String) async throws -> FlightWindowResponse {
        let path = airline == .ryanair ? "/travel/flights/ryanair" : "/travel/flights/wizzair"
        return try await get(path, params: ["origin": origin, "destination": destination, "eventDay": eventDay])
    }

    /// Places for one Wycieczki section around the event coordinates. `day` is the
    /// trip day (YYYY-MM-DD); the partner filters availability around it.
    static func getTravelPlaces(kind: PlaceKind, lat: Double, lng: Double, limit: Int = 15, offset: Int = 0, day: String? = nil) async throws -> TravelPlacesResponse {
        var params = [
            "kind": kind.rawValue,
            "lat": String(lat),
            "lng": String(lng),
            "limit": String(limit),
            "offset": String(offset),
        ]
        if let day {
            params["day"] = day
        }
        return try await get("/travel/places", params: params)
    }

    /// Stay22 hotel map widget URL for one anchor, date window and listing options.
    static func getStaysWidgetURL(_ query: StaysWidgetQuery) async throws -> URL? {
        var params = [
            "checkin": query.checkin,
            "checkout": query.checkout,
            "theme": query.theme,
            "view": query.view.rawValue,
        ]
        if let lat = query.point.lat, let lng = query.point.lng {
            params["lat"] = String(lat)
            params["lng"] = String(lng)
        } else if let address = query.point.address {
            params["address"] = address
        }
        if let priceper = query.priceper { params["priceper"] = priceper }
        if let minstars = query.minstars { params["minstars"] = String(minstars) }
        if let minguest = query.minguest { params["minguest"] = String(minguest) }
        let response: StaysWidgetResponse = try await get("/travel/stays-widget", params: params)
        return URL(string: response.url)
    }
}
