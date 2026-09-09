import SwiftUI
import MapKit

/// Wycieczki content provider — airports + flight arcs + travel events over Europe.
/// Data: Polish airports + destinations are hardcoded (TripsData); events come from
/// GET /travel/events. Category switch picks this provider; the map shell is shared.
@MainActor
final class TripsViewModel: ObservableObject, MapContentProvider {
    @Published var selectedAirport: Airport
    @Published var selectedWeekOffset: Int = 0
    /// Travel tag filter — nil = all. Matches travel_events.tag.
    @Published var selectedTag: TravelTag?
    @Published var events: [TravelEvent] = []
    /// Flight layer (airport pins + arcs) is hidden until an event is selected.
    @Published var showFlightLayer: Bool = false
    @Published var selectedTravelEvent: TravelEvent?
    /// The tapped pin's group (cluster) shown by the bottom card; nil = no card.
    @Published var selectedEventGroup: EventGroup?

    private var eventsCache: [String: [String: TravelEvent]] = [:]
    private var isLoading = false
    private var cachedOriginAirlines: [Airline] = []
    private var cachedPosts: [Post] = []

    enum TravelTag: String, CaseIterable, Identifiable {
        // rawValues must match backend TRAVEL_TAGS (constants.ts).
        case cityBreak = "citybreak"
        case football = "pilka-nozna"
        case runs = "biegi"

        var id: String { rawValue }
        var label: String {
            switch self {
            case .cityBreak: return "City-break"
            case .football: return "Piłka nożna"
            case .runs: return "Biegi"
            }
        }
    }

    init() {
        selectedAirport = TripsData.polishAirports[0]
        cachedOriginAirlines = Self.airlines(for: destinations)
    }

    var overlays: [MapOverlay] {
        let origin = selectedAirport
        var result: [MapOverlay] = []
        if showFlightLayer, let selected = selectedTravelEvent {
            for dest in nearbyDestinations(for: selected) {
                result.append(.arc(FlightArc(
                    id: "\(origin.iata)-\(dest.iata)-\(dest.providers.map(\.rawValue).joined(separator: "+"))",
                    from: CLLocationCoordinate2D(latitude: origin.lat, longitude: origin.lng),
                    to: CLLocationCoordinate2D(latitude: dest.lat, longitude: dest.lng),
                    airline: dest.providers.contains(.wizzair) ? .wizzair : .ryanair
                )))
                result.append(.airport(AirportPin(iata: dest.iata, coord: CLLocationCoordinate2D(latitude: dest.lat, longitude: dest.lng), airlines: dest.providers)))
            }
        }
        // Origin pin is the category anchor — always visible in trips mode.
        result.append(.airport(AirportPin(
            iata: origin.iata,
            coord: CLLocationCoordinate2D(latitude: origin.lat, longitude: origin.lng),
            isOrigin: true,
            airlines: cachedOriginAirlines
        )))
        for post in cachedPosts {
            result.append(.pin(MapPin(post: post)))
        }
        return result
    }

    private static func airlines(for destinations: [Destination]) -> [Airline] {
        let providers = Set(destinations.flatMap { $0.providers })
        var airlines: [Airline] = []
        if providers.contains(.wizzair) { airlines.append(.wizzair) }
        if providers.contains(.ryanair) { airlines.append(.ryanair) }
        return airlines
    }

    /// Reachable destinations (from origin) within the nearby radius, nearest first.
    /// THE source for both the map arcs and the card's airport rail — they must agree.
    func nearbyDestinations(for event: TravelEvent) -> [Destination] {
        let eventCoord = CLLocation(latitude: event.lat, longitude: event.lng)
        return destinations
            .filter { dest in
                let d = CLLocation(latitude: dest.lat, longitude: dest.lng)
                return eventCoord.distance(from: d) <= AppConstants.nearbyAirportRadiusMeters
            }
            .sorted { lhs, rhs in
                eventCoord.distance(from: CLLocation(latitude: lhs.lat, longitude: lhs.lng))
                    < eventCoord.distance(from: CLLocation(latitude: rhs.lat, longitude: rhs.lng))
            }
    }

    /// Select an event pin (by post id, with its tapped cluster group): shows nearby
    /// airports + arcs and opens the bottom card. No story viewer for trips.
    func selectTravelEvent(postId: String, group: [Post] = []) {
        guard let event = events.first(where: { $0.id == postId }) else { return }
        selectedTravelEvent = event
        showFlightLayer = true
        let groupEvents = group
            .compactMap { p in events.first { $0.id == p.id } }
        selectedEventGroup = EventGroup(events: groupEvents.isEmpty ? [event] : groupEvents)
    }

    private func clearSelection() {
        selectedTravelEvent = nil
        showFlightLayer = false
        selectedEventGroup = nil
    }

    /// Card dismiss (drag/X) — clears selection so arcs + airports hide.
    func clearSelectionPublic() {
        clearSelection()
    }

    /// All destinations for the selected origin (hardcoded route data).
    var destinations: [Destination] {
        TripsData.destinations[selectedAirport.iata] ?? []
    }

    var initialRegion: MKCoordinateRegion {
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: selectedAirport.lat, longitude: selectedAirport.lng),
            span: MKCoordinateSpan(latitudeDelta: 40, longitudeDelta: 40)
        )
    }

    var defaultZoom: Double { 4 }

    var maxZoomOutDistance: CLLocationDistance { AppConstants.tripsMaxZoomOutDistance }

    func onRegionChange(swLat: Double, swLng: Double, neLat: Double, neLng: Double) {
        // Travel events are fetched per week over the whole window; bbox scoping
        // happens server-side per request. Keep the last requested region.
    }

    func onCameraSettled(_ region: MKCoordinateRegion) {}

    func selectAirport(_ airport: Airport) {
        selectedAirport = airport
        cachedOriginAirlines = Self.airlines(for: destinations)
        eventsCache = [:]
        cachedPosts = []
        clearSelection()
        refresh()
    }

    func selectTag(_ tag: TravelTag?) {
        selectedTag = tag
        clearSelection()
        refresh()
    }

    func commitWeek(_ offset: Int) {
        guard selectedWeekOffset != offset else { return }
        selectedWeekOffset = offset
        clearSelection()
        refresh()
    }

    func refresh() {
        guard !isLoading else { return }
        isLoading = true
        Task { [weak self] in
            await self?.loadEvents()
            self?.isLoading = false
        }
    }

    private func loadEvents() async {
        let (from, to) = weekRange(offset: selectedWeekOffset)
        let region = initialRegion
        let swLat = region.center.latitude - region.span.latitudeDelta / 2
        let swLng = region.center.longitude - region.span.longitudeDelta / 2
        let neLat = region.center.latitude + region.span.latitudeDelta / 2
        let neLng = region.center.longitude + region.span.longitudeDelta / 2
        let key = "\(selectedAirport.iata)|\(from)-\(to)|\(selectedTag?.rawValue ?? "")"
        if let cached = eventsCache[key], !cached.isEmpty {
            apply(Array(cached.values))
            return
        }
        guard let resp = try? await APIClient.getTravelEvents(
            swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng,
            from: from, to: to, tag: selectedTag?.rawValue, origin: selectedAirport.iata
        ) else { return }
        var bucket: [String: TravelEvent] = [:]
        for e in resp.events { bucket[e.id] = e }
        eventsCache[key] = bucket
        apply(Array(bucket.values))
    }

    private func apply(_ newEvents: [TravelEvent]) {
        events = newEvents.sorted { $0.start_ms < $1.start_ms }
        cachedPosts = events.compactMap { $0.asPost }
    }

    /// (from, to) epoch ms for a week offset (0..12), Monday-start. Week 0 starts
    /// today (no history — clamped so the filter is "od dziś", never the past).
    func weekRange(offset: Int) -> (Int64, Int64) {
        let calendar = AppConstants.warsawCalendar
        let today = calendar.startOfDay(for: Date())
        let weekday = calendar.component(.weekday, from: today) // 1=Sun
        let daysToMonday = (weekday + 5) % 7
        let monday = calendar.date(byAdding: .day, value: -daysToMonday + offset * 7, to: today)!
        let from = max(monday, today)
        let sunday = calendar.date(byAdding: .day, value: 6, to: monday)!
        let endOfSunday = calendar.date(byAdding: .day, value: 1, to: sunday)!
        return (Int64(from.timeIntervalSince1970 * 1000), Int64(endOfSunday.timeIntervalSince1970 * 1000) - 1)
    }

    private func dateLabel(_ ms: Int64) -> String {
        AppConstants.shortDayFormatter.string(from: Date(timeIntervalSince1970: TimeInterval(ms) / 1000))
    }

    func weekStartLabel(offset: Int) -> String {
        let (from, _) = weekRange(offset: offset)
        return "od \(dateLabel(from))"
    }

    func weekEndLabel(offset: Int) -> String {
        let (_, to) = weekRange(offset: offset)
        return "do \(dateLabel(to))"
    }
}

extension TravelEvent {
    /// Bridge travel events into the Post shape so the shared map pin path renders them.
    var asPost: Post? {
        Post(
            id: id, user_id: "travel", type: .photo,
            lat: lat, lng: lng, description: title,
            media_key: nil, thumb_key: nil, created_at: start_ms,
            likes_count: 0, views_count: 0, shares_count: 0, dislikes_count: 0,
            grid_cell_id: nil, liked: false, disliked: false, watched: false,
            author_name: provider, media_url: nil, thumb_url: nil, author_avatar_url: nil,
            is_sponsored: false, category: nil, link_url: link, is_sold_out: nil,
            showtimes: nil, showtime_booking: nil, tags: [tag], source: provider
        )
    }
}

extension Post {
    /// Pin glyph for a travel event, derived from its tag (football vs running vs citybreak).
    var travelPinSymbol: String? {
        guard let tags else { return nil }
        if tags.contains(TripsViewModel.TravelTag.runs.rawValue) { return "figure.run" }
        if tags.contains(TripsViewModel.TravelTag.football.rawValue) { return "soccerball" }
        if tags.contains(TripsViewModel.TravelTag.cityBreak.rawValue) { return "building.2.fill" }
        return "airplane"
    }
}