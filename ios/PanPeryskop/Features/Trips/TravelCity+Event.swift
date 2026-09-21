import Foundation

extension TravelCity {
    /// Bridge a city into the event shape, so stays, places and partners reuse
    /// their existing sections unchanged.
    func asTravelEvent(day: Date) -> TravelEvent {
        let noon = AppConstants.warsawCalendar.startOfDay(for: day).addingTimeInterval(12 * 3_600)
        return TravelEvent(
            provider: "citybreak",
            external_id: id,
            title: name,
            lat: lat,
            lng: lng,
            city: name,
            country: country,
            start_ms: Int64(noon.timeIntervalSince1970 * 1_000),
            tag: "citybreak",
            link: nil,
            meta: nil,
            reachableAirports: connections.map(\.iata),
            reachableCarriers: nil,
            venueIsAirport: false
        )
    }
}
