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

    private var eventsCache: [String: [String: TravelEvent]] = [:]
    private var isLoading = false

    enum TravelTag: String, CaseIterable, Identifiable {
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
    }

    var overlays: [MapOverlay] {
        let origin = selectedAirport
        var result: [MapOverlay] = []
        // Flight layer: reachable airports near the selected event + arcs from origin.
        if showFlightLayer, let selected = selectedTravelEvent {
            for dest in nearbyAirports(of: selected) {
                result.append(.arc(FlightArc(
                    id: "\(origin.iata)-\(dest.iata)-\(dest.providers.joined(separator: "+"))",
                    from: CLLocationCoordinate2D(latitude: origin.lat, longitude: origin.lng),
                    to: CLLocationCoordinate2D(latitude: dest.lat, longitude: dest.lng),
                    airline: dest.providers.contains("wizzair") ? .wizzair : .ryanair
                )))
                result.append(.airport(AirportPin(iata: dest.iata, coord: CLLocationCoordinate2D(latitude: dest.lat, longitude: dest.lng))))
            }
            result.append(.airport(AirportPin(iata: origin.iata, coord: CLLocationCoordinate2D(latitude: origin.lat, longitude: origin.lng))))
        }
        for event in filteredEvents {
            result.append(.pin(MapPin(post: event)))
        }
        return result
    }

    /// Reachable destinations (from origin) within 200 km of the selected event.
    private func nearbyAirports(of event: TravelEvent) -> [Destination] {
        let eventCoord = CLLocationCoordinate2D(latitude: event.lat, longitude: event.lng)
        return destinations.filter { dest in
            let d = CLLocation(latitude: dest.lat, longitude: dest.lng)
            return CLLocation(latitude: eventCoord.latitude, longitude: eventCoord.longitude).distance(from: d) <= 200_000
        }
    }

    /// Select an event pin (by post id): shows nearby airports + arcs, no story.
    func selectTravelEvent(postId: String) {
        guard let event = events.first(where: { $0.id == postId }) else { return }
        selectedTravelEvent = event
        showFlightLayer = true
    }

    private func clearSelection() {
        selectedTravelEvent = nil
        showFlightLayer = false
    }

    /// All destinations for the selected origin (hardcoded route data).
    var destinations: [Destination] {
        TripsData.destinations[selectedAirport.iata] ?? []
    }

    private var filteredEvents: [Post] {
        events.compactMap { $0.asPost }
    }

    var initialRegion: MKCoordinateRegion {
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 52.0, longitude: 14.0),
            span: MKCoordinateSpan(latitudeDelta: 40, longitudeDelta: 40)
        )
    }

    var defaultZoom: Double { 4 }

    var maxZoomOutDistance: CLLocationDistance { 6_000_000 }

    func onRegionChange(swLat: Double, swLng: Double, neLat: Double, neLng: Double) {
        // Travel events are fetched per week over the whole window; bbox scoping
        // happens server-side per request. Keep the last requested region.
    }

    func onCameraSettled(_ region: MKCoordinateRegion) {}

    func selectAirport(_ airport: Airport) {
        selectedAirport = airport
        eventsCache = [:]
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
        let key = "\(from)-\(to)|\(selectedTag?.rawValue ?? "")"
        if let cached = eventsCache[key], !cached.isEmpty {
            events = Array(cached.values).sorted { $0.start_ms < $1.start_ms }
            return
        }
        guard let resp = try? await APIClient.getTravelEvents(
            swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng,
            from: from, to: to, tag: selectedTag?.rawValue
        ) else { return }
        var bucket: [String: TravelEvent] = [:]
        for e in resp.events { bucket[e.id] = e }
        eventsCache[key] = bucket
        events = Array(bucket.values).sorted { $0.start_ms < $1.start_ms }
    }

    /// (from, to) epoch ms for a week offset (0..12), Monday-start. Week 0 starts
    /// today (no history — clamped so the filter is "od dziś", never the past).
    func weekRange(offset: Int) -> (Int64, Int64) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Warsaw")!
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
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "Europe/Warsaw")!
        f.dateFormat = "dd.MM"
        return f.string(from: Date(timeIntervalSince1970: TimeInterval(ms) / 1000))
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
            showtimes: nil, showtime_booking: nil, tags: nil, source: provider
        )
    }
}