import Foundation

// MARK: - Travel (Wycieczki)

extension APIClient {
    /// Travel events for a day window, optionally reachable from an origin
    /// airport. `from`/`to` are epoch ms. No bbox: reachability scopes the set.
    static func getTravelEvents(from: Int64, to: Int64, tags: String? = nil, origins: [String] = []) async throws -> TravelEventsResponse {
        var params = [
            "from": String(from),
            "to": String(to),
            "limit": "1000",
        ]
        if let tags { params["tags"] = tags }
        if !origins.isEmpty { params["origins"] = origins.joined(separator: ",") }
        return try await get("/travel/events", params: params, timeout: AppConstants.travelRequestTimeout)
    }

    /// Travel catalogue for the current content version. Returns `nil` on 304
    /// (the caller's copy is still current).
    static func getCatalogue(etag: String?) async throws -> TravelCatalogue? {
        guard let data = try await HTTPClient.shared.getConditional(
            "/travel/catalogue",
            etag: etag,
            timeout: AppConstants.travelRequestTimeout
        ) else { return nil }
        return try JSONDecoder().decode(TravelCatalogue.self, from: data)
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
        if let nearLat = query.nearLat, let nearLng = query.nearLng {
            params["nearLat"] = String(nearLat)
            params["nearLng"] = String(nearLng)
        }
        let response: StaysWidgetResponse = try await get("/travel/stays-widget", params: params)
        return URL(string: response.url)
    }
}
