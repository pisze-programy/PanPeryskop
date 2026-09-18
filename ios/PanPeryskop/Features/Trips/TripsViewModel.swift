import SwiftUI
import MapKit

/// Wycieczki content provider — airports + flight arcs + travel events over Europe.
/// Data: Polish airports + destinations are hardcoded (TripsData); events come from
/// GET /travel/events. Category switch picks this provider; the map shell is shared.
@MainActor
final class TripsViewModel: ObservableObject, MapContentProvider {
    @Published var selectedAirport: Airport
    @Published var selectedDayOffset: Int = 0
    /// Selected tag filter (all by default, at least one stays on), persisted.
    @Published private var tagSelection = MultiTagSelection(prefsKey: TripsPrefs.selectedTags)
    /// Event-count badge per travel tag (Europe-wide, selected day).
    @Published var tagCounts: [String: Int] = [:]
    @Published var events: [TravelEvent] = []
    /// Flight layer (airport pins + arcs) is hidden until an event is selected.
    @Published var showFlightLayer: Bool = false
    @Published var selectedTravelEvent: TravelEvent?
    /// The tapped pin's group (cluster) shown by the bottom card; nil = no card.
    @Published var selectedEventGroup: EventGroup?

    private var eventsCache: [String: [String: TravelEvent]] = [:]
    /// True while a user-triggered fetch (day/airport/tag) is in flight — drives the
    /// Wycieczki pill loader. Trips has no polling, so every load qualifies.
    @Published private(set) var isLoading = false
    private var loadTask: Task<Void, Never>?
    private var loadGeneration = 0
    private static let loadErrorMessage = "Coś poszło nie tak, spróbuj ponownie"
    private static let refinementAttempts = 3
    private static let refinementDelayMilliseconds = 1_500
    private var cachedOriginAirlines: [Airline] = []
    private var cachedPosts: [Post] = []

    enum TravelTag: String, CaseIterable, Identifiable {
        // rawValues must match backend TRAVEL_TAGS (constants.ts).
        // Fixed display/selection order — independent of tag counts.
        case cityBreak = "citybreak"
        case runs = "biegi"
        case football = "pilka-nozna"

        var id: String { rawValue }
        var label: String {
            switch self {
            case .cityBreak: return "City-break"
            case .runs: return "Biegi"
            case .football: return "Piłka nożna"
            }
        }
    }

    private enum TripsPrefs {
        static let airportIata = "trips.last_airport_iata"
        static let selectedTags = "trips.selected_tags"
        static let selectedDay = "trips.selected_day"
    }

    /// Day-browser range, shared by the slider and the day sheet.
    static let minDayOffset = 0
    static let maxDayOffset = 89
    static var dayOffsets: [Int] { Array(minDayOffset...maxDayOffset) }

    init() {
        let savedIata = UserDefaults.standard.string(forKey: TripsPrefs.airportIata)
        selectedAirport = TripsData.polishAirports.first { $0.iata == savedIata } ?? TripsData.polishAirports[0]
        selectedDayOffset = min(StoredDay.loadOffset(key: TripsPrefs.selectedDay) ?? 0, Self.maxDayOffset)
        tagSelection.sync(all: Set(TravelTag.allCases.map(\.rawValue)))
        cachedOriginAirlines = Self.airlines(for: destinations)
    }

    var overlays: [MapOverlay] {
        let origin = selectedAirport
        var result: [MapOverlay] = []
        if showFlightLayer, let selected = selectedTravelEvent {
            for dest in reachableDestinations(for: selected) {
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
        for post in cachedPosts where post.tags?.contains(where: isTagSelected) ?? false {
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

    /// Nearby airports the backend confirmed have flights from the origin around
    /// the event day; falls back to all nearby when the backend didn't filter.
    func reachableDestinations(for event: TravelEvent) -> [Destination] {
        let nearby = nearbyDestinations(for: event)
        guard let allowed = event.reachableAirports, !allowed.isEmpty else { return nearby }
        return nearby.filter { allowed.contains($0.iata) }
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
            span: MKCoordinateSpan(latitudeDelta: 60, longitudeDelta: 60)
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
        UserDefaults.standard.set(airport.iata, forKey: TripsPrefs.airportIata)
        cachedOriginAirlines = Self.airlines(for: destinations)
        clearSelection()
        refresh()
    }

    /// Toggle one travel tag. The last selected tag cannot be turned off. Filtering
    /// is local: the day's events are fetched for every tag, so no network call.
    func toggleTag(_ id: String) {
        tagSelection.toggle(id)
        clearSelection()
    }

    func isTagSelected(_ id: String) -> Bool { tagSelection.isSelected(id) }

    func commitDay(_ offset: Int) {
        guard selectedDayOffset != offset else { return }
        selectedDayOffset = offset
        StoredDay.save(offset: offset, key: TripsPrefs.selectedDay)
        clearSelection()
        refresh()
    }

    func refresh() {
        loadTask?.cancel()
        loadGeneration += 1
        let generation = loadGeneration
        let startedAt = Date()
        isLoading = true
        loadTask = Task { [weak self] in
            await self?.runLoad(generation: generation, startedAt: startedAt)
        }
    }

    private func runLoad(generation: Int, startedAt: Date) async {
        let failed = await loadEvents(generation: generation)
        guard loadGeneration == generation else { return }
        await holdLoader(since: startedAt)
        guard loadGeneration == generation else { return }
        isLoading = false
        guard failed else { return }
        ToastManager.shared.show(Self.loadErrorMessage, seconds: AppConstants.travelErrorToastSeconds)
    }

    private func holdLoader(since startedAt: Date) async {
        let minS = Double(AppConstants.minLoadingIndicatorMs) / 1000
        let elapsed = Date().timeIntervalSince(startedAt)
        guard elapsed < minS else { return }
        try? await Task.sleep(nanoseconds: UInt64((minS - elapsed) * 1_000_000_000))
    }

    private func loadEvents(generation: Int) async -> Bool {
        let (from, to) = dayRange(offset: selectedDayOffset)
        let key = "\(selectedAirport.iata)|\(from)-\(to)"
        if let cached = eventsCache[key], !cached.isEmpty {
            apply(cached, generation: generation)
            return false
        }
        do {
            let resp = try await APIClient.getTravelEvents(
                from: from, to: to,
                origin: selectedAirport.iata
            )
            guard loadGeneration == generation else { return false }
            let bucket = Dictionary(resp.events.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            if resp.enriched ?? true { eventsCache[key] = bucket }
            apply(bucket, generation: generation)
            if resp.enriched == false { scheduleRefinement(generation: generation, attempt: 1) }
            return false
        } catch {
            guard !(error is CancellationError) else { return false }
            return true
        }
    }

    private func scheduleRefinement(generation: Int, attempt: Int) {
        guard attempt <= Self.refinementAttempts else { return }
        Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(Self.refinementDelayMilliseconds * attempt))
            guard let self, self.loadGeneration == generation else { return }
            _ = await self.loadEvents(generation: generation)
        }
    }

    private func apply(_ bucket: [String: TravelEvent], generation: Int) {
        guard loadGeneration == generation else { return }
        events = bucket.values.sorted { $0.start_ms < $1.start_ms }
        cachedPosts = events.compactMap(\.asPost)
        tagCounts = Dictionary(grouping: events, by: \.tag).mapValues(\.count)
    }

    /// (from, to) epoch ms for a day offset (0..89), 0 = today. Per-day fetch —
    /// same granularity as the Events day slider, full 90-day trips window.
    func dayRange(offset: Int) -> (Int64, Int64) {
        let calendar = AppConstants.warsawCalendar
        let day = calendar.date(byAdding: .day, value: offset, to: calendar.startOfDay(for: Date()))!
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: day)!
        return (Int64(day.timeIntervalSince1970 * 1000), Int64(endOfDay.timeIntervalSince1970 * 1000) - 1)
    }

    func dayLabel(offset: Int) -> String { DayLabels.short(offset: offset) }
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