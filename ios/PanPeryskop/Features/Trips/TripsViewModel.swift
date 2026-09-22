import SwiftUI
import MapKit

/// Wycieczki content provider — airports + flight arcs + travel events over Europe.
/// Data: airports + destinations come from the travel catalogue (CatalogueStore);
/// events come from GET /travel/events. Category switch picks this provider; the
/// map shell is shared.
@MainActor
final class TripsViewModel: ObservableObject, MapContentProvider {
    @Published var selectedCity: City
    @Published var selectedDayOffset: Int = 0
    /// Selected tag filter (all by default, at least one stays on), persisted.
    @Published private var tagSelection = MultiTagSelection(prefsKey: TripsPrefs.selectedTags)
    /// Event-count badge per travel tag (Europe-wide, selected day).
    @Published var tagCounts: [String: Int] = [:]
    @Published var events: [TravelEvent] = []
    /// City-break destinations for the selected origin + day.
    @Published var cities: [TravelCity] = []
    @Published var selectedCityBreak: TravelCity?
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
    private var citiesTask: Task<Void, Never>?
    private var cityBreakCount = 0
    private static let loadErrorMessage = "Coś poszło nie tak, spróbuj ponownie"
    private static let confirmErrorMessage = "Nie udało się potwierdzić lotów, spróbuj ponownie"
    private static let searchToast = "Szukamy połączeń.."
    private static let searchEventsToast = "Szukamy wydarzeń.."
    private static let loadingToast = "Ładowanie..."
    private static let emptyToast = "Brak wydarzeń dla tego dnia i lotu"
    private static let loadToastKey = "trips-load"
    private static let refinementAttempts = 12
    private static let refinementDelayMilliseconds = 400
    private var cachedOriginAirlines: [Airline] = []
    private var cachedPosts: [Post] = []
    /// Loading scene: origin→airport connections drawn while the events load.
    @Published private(set) var loadingArcs: [MapOverlay] = []
    /// Pins enter only after the loading scene ends. Data is always kept in
    /// `cachedPosts`, so a fast response can never leave the map empty.
    @Published private(set) var showPins = false
    private var loaderTask: Task<Void, Never>?
    private var loadToastTask: Task<Void, Never>?
    private var loaderStartedAt: Date?
    /// The scene may only render while this is true. A stale scene can never leak
    /// into `overlays` just because `loadingArcs` still holds a frame.
    private var isLoaderActive = false
    private var loaderAnimationFinished = false
    /// Bumped per scene. A cancelled animation can never paint an old frame.
    private var loaderGeneration = 0
    /// The loading scene runs to the end even when the events arrive sooner; a
    /// cut-off arc looks like a glitch. Pins appear after the fade-out.
    private static let loaderAnimationMs = 1_650
    /// Destinations and airports of the current city. Computed only when the city
    /// changes — both are read on every map render.
    private var mergedDestinations: [Destination] = []
    private var cachedOriginAirports: [Airport] = []

    enum TravelTag: String, CaseIterable, Identifiable {
        case runs = "biegi"
        case football = "pilka-nozna"
        case citybreak = "citybreak"

        var id: String { rawValue }
        var label: String {
            switch self {
            case .runs: return "Biegi"
            case .football: return "Piłka nożna"
            case .citybreak: return "City break"
            }
        }
    }

    private enum TripsPrefs {
        static let cityId = "trips.last_city_id"
        static let selectedTags = "trips.selected_tags"
        static let selectedDay = "trips.selected_day"
    }

    /// Day-browser range, shared by the slider and the day sheet.
    static let minDayOffset = 0
    static let maxDayOffset = 89
    static var dayOffsets: [Int] { Array(minDayOffset...maxDayOffset) }

    init() {
        selectedCity = Self.restoreCity()
        selectedDayOffset = min(StoredDay.loadOffset(key: TripsPrefs.selectedDay) ?? 0, Self.maxDayOffset)
        tagSelection.sync(all: Set(TravelTag.allCases.map(\.rawValue)))
        recomputeDestinations()
        loadCities()
    }

    private func recomputeDestinations() {
        cachedOriginAirports = Self.airports(for: selectedCity)
        mergedDestinations = Self.mergeDestinations(cachedOriginAirports)
        cachedOriginAirlines = Self.airlines(for: mergedDestinations)
    }

    /// Restores the origin city. Falls back to the retired airport preference so
    /// an existing user keeps their city after the airport → city move.
    private static func restoreCity() -> City {
        let defaults = UserDefaults.standard
        let store = CatalogueStore.shared
        if let id = defaults.string(forKey: TripsPrefs.cityId), let city = store.city(id: id) {
            return city
        }
        if let iata = defaults.string(forKey: Self.legacyAirportPref),
           let city = store.cities.first(where: { $0.airports.contains(iata) })?.city {
            return city
        }
        return store.defaultCity
    }

    private static let legacyAirportPref = "trips.last_airport_iata"

    private var flightDestinations: [Destination] {
        if let event = selectedTravelEvent { return reachableDestinations(for: event) }
        guard let city = selectedCityBreak else { return [] }
        let wanted = Set(city.airports)
        return destinations.filter { wanted.contains($0.iata) }
    }

    var overlays: [MapOverlay] {
        var result: [MapOverlay] = isLoaderActive && !showFlightLayer ? loadingArcs : []
        if showFlightLayer {
            for dest in flightDestinations {
                result.append(contentsOf: arcs(for: dest, allowed: selectedTravelEvent?.reachableCarriers?[dest.iata]))
                result.append(.airport(AirportPin(iata: dest.iata, coord: CLLocationCoordinate2D(latitude: dest.lat, longitude: dest.lng), airlines: dest.providers)))
            }
        }
        // Origin pins are the category anchor — always visible in trips mode.
        for origin in originAirports {
            result.append(.airport(AirportPin(
                iata: origin.iata,
                coord: CLLocationCoordinate2D(latitude: origin.lat, longitude: origin.lng),
                isOrigin: true,
                airlines: cachedOriginAirlines
            )))
        }
        if showPins {
            for post in cachedPosts where post.tags?.contains(where: isTagSelected) ?? false {
                result.append(.pin(MapPin(post: post)))
            }
        }
        // Cities wait for the loading scene like the event pins do: drawing them
        // during the arc animation re-rendered the whole city layer on all 30
        // frames of the scene.
        if showPins, isTagSelected(TravelTag.citybreak.rawValue) {
            for city in visibleCities {
                result.append(.city(CityPin(city: city)))
            }
        }
        return result
    }

    var sortedTags: [TravelTag] {
        let pills = TravelTag.allCases.map { TagPill(id: $0.rawValue, label: $0.label) }
        return TagSorting.sorted(pills, counts: tagCounts).compactMap { TravelTag(rawValue: $0.id) }
    }

    /// Every city the origin can actually fly to, whatever the day: one of its
    /// airports is served from here. A city with none is not a city break from
    /// this origin, so the map and the count leave it out.
    private var visibleCities: [TravelCity] {
        let served = Set(mergedDestinations.map(\.iata))
        return cities.filter { city in city.airports.contains { served.contains($0) } }
    }

    /// The airports of the selected city. Warszawa has two; the rest have one.
    /// Cached per city — read on every map render.
    var originAirports: [Airport] { cachedOriginAirports }

    private static func airports(for city: City) -> [Airport] {
        let catalogue = CatalogueStore.shared.catalogue
        let airports = catalogue.originAirports(for: city.id)
        if !airports.isEmpty { return airports }
        return catalogue.airports.first.map { [$0] } ?? []
    }

    var originIatas: [String] { originAirports.map(\.iata) }

    private func originAirport(nearestTo dest: Destination) -> Airport {
        let target = CLLocation(latitude: dest.lat, longitude: dest.lng)
        return originAirports.min { lhs, rhs in
            CLLocation(latitude: lhs.lat, longitude: lhs.lng).distance(from: target)
                < CLLocation(latitude: rhs.lat, longitude: rhs.lng).distance(from: target)
        } ?? originAirports[0]
    }

    /// Arcs from the serving origin to a destination. A route flown by both
    /// carriers draws two parallel arcs, one per colour.
    private func arcs(
        for dest: Destination,
        progress: Double = 1,
        scene: String = "",
        allowed: [String]? = nil
    ) -> [MapOverlay] {
        let providers = allowed.map { allow in dest.providers.filter { allow.contains($0.rawValue) } } ?? dest.providers
        guard !providers.isEmpty else { return [] }
        let origin = originAirport(nearestTo: dest)
        let from = CLLocationCoordinate2D(latitude: origin.lat, longitude: origin.lng)
        let to = CLLocationCoordinate2D(latitude: dest.lat, longitude: dest.lng)
        let prefix = scene.isEmpty ? "" : "\(scene)-"
        let base = "\(prefix)\(origin.iata)-\(dest.iata)"
        if providers.contains(.ryanair) && providers.contains(.wizzair) {
            return [
                .arc(FlightArc(id: "\(base)-R", from: from, to: to, airlines: [.ryanair], progress: progress, bowOffset: 0.35)),
                .arc(FlightArc(id: "\(base)-W", from: from, to: to, airlines: [.wizzair], progress: progress, bowOffset: -0.35)),
            ]
        }
        let carrier: Airline = providers.contains(.wizzair) ? .wizzair : .ryanair
        return [.arc(FlightArc(id: base, from: from, to: to, airlines: [carrier], progress: progress))]
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
    /// Returns false when the tapped pin is no longer in `events` (a background
    /// refinement replaced them). The caller must not open the sheet then.
    @discardableResult
    func selectTravelEvent(postId: String, group: [Post] = []) -> Bool {
        guard let event = events.first(where: { $0.id == postId }) else { return false }
        clearLoadingScene()
        selectedTravelEvent = event
        showFlightLayer = true
        let groupEvents = group
            .compactMap { p in events.first { $0.id == p.id } }
        selectedEventGroup = EventGroup(events: groupEvents.isEmpty ? [event] : groupEvents)
        return true
    }

    func selectGroup(posts: [Post], cities: [TravelCity]) {
        clearLoadingScene()
        let groupEvents = posts.compactMap { p in events.first { $0.id == p.id } }
        selectedTravelEvent = groupEvents.first
        selectedCityBreak = cities.first
        showFlightLayer = !groupEvents.isEmpty || !cities.isEmpty
        selectedEventGroup = EventGroup(events: groupEvents, cities: cities)
    }

    private func clearSelection() {
        selectedTravelEvent = nil
        showFlightLayer = false
        selectedEventGroup = nil
        selectedCityBreak = nil
    }

    /// Card dismiss (drag/X) — clears selection so arcs + airports hide.
    func clearSelectionPublic() {
        clearSelection()
    }

    /// All destinations of the selected city, merged across its airports. A
    /// destination served from two airports keeps one entry with the union of
    /// its carriers.
    var destinations: [Destination] { mergedDestinations }

    static func mergeDestinations(
        _ airports: [Airport],
        catalogue: TravelCatalogue = CatalogueStore.shared.catalogue
    ) -> [Destination] {
        var byIata: [String: Destination] = [:]
        for airport in airports {
            for dest in catalogue.destinations[airport.iata] ?? [] {
                guard let existing = byIata[dest.iata] else {
                    byIata[dest.iata] = dest
                    continue
                }
                let providers = existing.providers + dest.providers.filter { !existing.providers.contains($0) }
                byIata[dest.iata] = Destination(
                    iata: existing.iata, name: existing.name, city: existing.city,
                    country: existing.country, lat: existing.lat, lng: existing.lng,
                    providers: providers
                )
            }
        }
        return Array(byIata.values)
    }

    /// One option per destination and carrier. A route served by both carriers
    /// yields two options, so the rail shows one carrier at a time.
    static func flightOptions(for destinations: [Destination]) -> [FlightOption] {
        destinations.flatMap { destination in
            destination.providers
                .sorted { $0.rawValue < $1.rawValue }
                .map { FlightOption(destination: destination, carrier: $0) }
        }
    }

    /// The origin airport that serves this destination (Warszawa has two); the
    /// first origin when none matches the catalogue route data.
    static func origin(
        for destination: Destination,
        among origins: [Airport],
        catalogue: TravelCatalogue = CatalogueStore.shared.catalogue
    ) -> Airport {
        origins.first { airport in
            catalogue.destinations[airport.iata]?.contains { $0.iata == destination.iata } ?? false
        } ?? origins[0]
    }

    /// Recompute after the catalogue changes (refresh).
    func reloadCatalogue() {
        selectedCity = CatalogueStore.shared.city(id: selectedCity.id) ?? CatalogueStore.shared.defaultCity
        recomputeDestinations()
    }

    /// Visual centre of Europe, so the whole continent fits instead of the origin
    /// city (which pushes the view east and cuts the west).
    var initialRegion: MKCoordinateRegion {
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 50, longitude: 10),
            span: MKCoordinateSpan(latitudeDelta: 44, longitudeDelta: 68)
        )
    }

    var initialDistance: CLLocationDistance? { maxZoomOutDistance }

    var maxZoomOutDistance: CLLocationDistance { AppConstants.tripsMaxZoomOutDistance }

    func onRegionChange(swLat: Double, swLng: Double, neLat: Double, neLng: Double) {
        // Travel events are fetched per week over the whole window; bbox scoping
        // happens server-side per request. Keep the last requested region.
    }

    func onCameraSettled(_ region: MKCoordinateRegion) {}

    /// Adopt the shared city without a fetch — the scope switch refreshes.
    /// Drops the previous city's pins at once, so the map never shows events from
    /// the old city while the new ones are still loading.
    func syncCity(_ city: City) {
        guard city.id != selectedCity.id else { return }
        selectedCity = city
        UserDefaults.standard.set(city.id, forKey: TripsPrefs.cityId)
        recomputeDestinations()
        clearSelection()
        clearLoadingScene()
        events = []
        cachedPosts = []
        cities = []
        cityBreakCount = 0
        showPins = false
        tagCounts = [:]
    }

    func selectCity(_ city: City) {
        syncCity(city)
        refresh(showLoader: true)
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

    /// `showLoader` draws the connections scene (entering Europe, city change).
    /// Day changes refresh silently.
    func refresh(showLoader: Bool = false) {
        loadTask?.cancel()
        loadCities()
        // Every refresh drops any previous scene first, so no stale frame survives.
        clearLoadingScene()
        loadGeneration += 1
        let generation = loadGeneration
        let startedAt = Date()
        isLoading = true
        startLoadToasts(showLoader: showLoader)
        if showLoader {
            cachedPosts = []
            showPins = false
            startLoadingScene()
        }
        loadTask = Task { [weak self] in
            await self?.runLoad(generation: generation, startedAt: startedAt)
        }
    }

    private func runLoad(generation: Int, startedAt: Date) async {
        defer { finishLoadToasts() }
        // The scene is self-contained: it runs to the end, then clears. Data is
        // resolved independently and pins appear only once it is confirmed.
        await holdLoader(since: startedAt)
        guard loadGeneration == generation else { return }
        await holdLoaderAnimation()
        guard loadGeneration == generation else { return }
        await waitForLoaderAnimation()
        guard loadGeneration == generation else { return }
        if isLoaderActive {
            withAnimation(.easeOut(duration: 0.3)) { clearLoadingScene() }
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard loadGeneration == generation else { return }
        } else {
            clearLoadingScene()
        }
        let outcome = await resolveEvents(generation: generation)
        guard loadGeneration == generation else { return }
        isLoading = false
        guard outcome == .confirmed else {
            events = []
            cachedPosts = []
            showPins = false
            tagCounts = [:]
            ToastManager.shared.show(
                outcome == .pending ? Self.confirmErrorMessage : Self.loadErrorMessage,
                seconds: AppConstants.travelErrorToastSeconds
            )
            return
        }
        if cachedPosts.isEmpty && !hasCityPins {
            ToastManager.shared.show(Self.emptyToast, seconds: 3)
        }
        showPins = true
    }

    /// The city-break layer can still fill the map when there are no events.
    private var hasCityPins: Bool {
        isTagSelected(TravelTag.citybreak.rawValue) && !visibleCities.isEmpty
    }

    private func startLoadToasts(showLoader: Bool) {
        loadToastTask?.cancel()
        ToastManager.shared.showSticky(showLoader ? Self.searchToast : Self.searchEventsToast, key: Self.loadToastKey)
        loadToastTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            guard !Task.isCancelled, self != nil else { return }
            ToastManager.shared.showSticky(Self.loadingToast, key: Self.loadToastKey)
        }
    }

    private func finishLoadToasts() {
        loadToastTask?.cancel()
        loadToastTask = nil
        ToastManager.shared.dismiss(key: Self.loadToastKey)
    }

    // MARK: - Loading scene

    private func startLoadingScene() {
        loaderTask?.cancel()
        loaderGeneration += 1
        let scene = "load\(loaderGeneration)"
        isLoaderActive = true
        loaderAnimationFinished = false
        // Remove the previous scene first, so SwiftUI diffs remove-then-add and
        // never morph an old arc into a new one.
        loadingArcs = []
        let picks = Self.randomLoaderDestinations(from: destinations, count: Int.random(in: 10...20))
        guard !picks.isEmpty else {
            clearLoadingScene()
            return
        }
        loaderStartedAt = Date()
        loadingArcs = loaderOverlays(picks: picks, progress: 0, scene: scene)
        let generation = loaderGeneration
        loaderTask = Task { [weak self] in
            await self?.animateLoader(picks, scene: scene, generation: generation)
        }
    }

    private func animateLoader(_ picks: [Destination], scene: String, generation: Int) async {
        let steps = 30
        for step in 1...steps {
            guard !Task.isCancelled, generation == loaderGeneration else { return }
            let progress = Double(step) / Double(steps)
            loadingArcs = loaderOverlays(picks: picks, progress: progress, scene: scene)
            try? await Task.sleep(nanoseconds: 1_500_000_000 / UInt64(steps))
            guard generation == loaderGeneration else { return }
        }
        if generation == loaderGeneration { loaderAnimationFinished = true }
    }

    private func clearLoadingScene() {
        loaderTask?.cancel()
        loaderTask = nil
        loaderGeneration += 1
        loaderStartedAt = nil
        loaderAnimationFinished = false
        isLoaderActive = false
        loadingArcs = []
    }

    /// Scene-scoped overlays: arcs and the destination airport pins, with the
    /// scene id in every identity so a stale frame can never match the current one.
    private func loaderOverlays(picks: [Destination], progress: Double, scene: String) -> [MapOverlay] {
        picks.flatMap { dest -> [MapOverlay] in
            let pin = MapOverlay.airport(AirportPin(
                iata: dest.iata,
                coord: CLLocationCoordinate2D(latitude: dest.lat, longitude: dest.lng),
                airlines: dest.providers,
                shimmer: true
            ))
            return arcs(for: dest, progress: progress, scene: scene) + [pin]
        }
    }

    /// Waits for the scene to finish drawing. The wall-clock minimum alone can cut
    /// the animation when a frame is delayed, so the animation itself signals the end.
    private func waitForLoaderAnimation() async {
        guard isLoaderActive else { return }
        let deadline = Date().addingTimeInterval(3)
        while !loaderAnimationFinished, Date() < deadline, !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
    }

    private func holdLoaderAnimation() async {
        guard let start = loaderStartedAt else { return }
        let remaining = Double(Self.loaderAnimationMs) / 1000 - Date().timeIntervalSince(start)
        guard remaining > 0 else { return }
        try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
    }

    /// 10–20 destinations with a wide spread, so the loading scene fills the map.
    static func randomLoaderDestinations(from all: [Destination], count: Int) -> [Destination] {
        var picked: [Destination] = []
        for candidate in all.shuffled() where picked.count < count {
            let spread = picked.allSatisfy { abs($0.lat - candidate.lat) + abs($0.lng - candidate.lng) > 6 }
            if spread { picked.append(candidate) }
        }
        for candidate in all.shuffled() where picked.count < count {
            if !picked.contains(where: { $0.iata == candidate.iata }) { picked.append(candidate) }
        }
        return picked
    }

    private func holdLoader(since startedAt: Date) async {
        let minS = Double(AppConstants.minLoadingIndicatorMs) / 1000
        let elapsed = Date().timeIntervalSince(startedAt)
        guard elapsed < minS else { return }
        try? await Task.sleep(nanoseconds: UInt64((minS - elapsed) * 1_000_000_000))
    }

    private enum LoadOutcome { case confirmed, pending, failed }

    /// Only a confirmed (enriched) answer may be shown. An unenriched answer is
    /// `pending`, so the loader stays up and we retry — no pin is ever retracted.
    private func loadEvents(generation: Int) async -> LoadOutcome {
        let (from, to) = dayRange(offset: selectedDayOffset)
        let key = "\(originIatas.joined(separator: ","))|\(from)-\(to)"
        if let cached = eventsCache[key], !cached.isEmpty {
            apply(cached, generation: generation)
            return .confirmed
        }
        do {
            let resp = try await APIClient.getTravelEvents(
                from: from, to: to,
                origins: originIatas
            )
            guard loadGeneration == generation else { return .failed }
            guard resp.enriched ?? true else { return .pending }
            let bucket = Dictionary(resp.events.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            eventsCache[key] = bucket
            apply(bucket, generation: generation)
            return .confirmed
        } catch {
            guard !(error is CancellationError) else { return .failed }
            return .failed
        }
    }

    /// Retries an unenriched answer until it is confirmed or the attempts run out.
    private func resolveEvents(generation: Int) async -> LoadOutcome {
        var attempt = 0
        while !Task.isCancelled {
            let outcome = await loadEvents(generation: generation)
            guard loadGeneration == generation else { return .failed }
            if outcome != .pending { return outcome }
            attempt += 1
            guard attempt < Self.refinementAttempts else { return .pending }
            try? await Task.sleep(for: .milliseconds(Self.refinementDelayMilliseconds))
            guard loadGeneration == generation else { return .failed }
        }
        return .failed
    }

    private func apply(_ bucket: [String: TravelEvent], generation: Int) {
        guard loadGeneration == generation else { return }
        events = bucket.values.sorted { $0.start_ms < $1.start_ms }
        refreshTagCounts()
        cachedPosts = events.compactMap(\.asPost)
    }

    /// Event tags count the day's events. `citybreak` counts the reachable
    /// cities, which is a different source — so it is merged in, not grouped.
    private func refreshTagCounts() {
        var counts = Dictionary(grouping: events, by: \.tag).mapValues(\.count)
        counts[TravelTag.citybreak.rawValue] = cityBreakCount
        tagCounts = counts
    }

    /// The backend reads route_days, so this never calls a provider.
    func loadCities() {
        citiesTask?.cancel()
        let origins = originIatas
        let day = dayIso(offset: selectedDayOffset)
        citiesTask = Task { [weak self] in
            do {
                let resp = try await APIClient.getCities(origins: origins, day: day)
                guard !Task.isCancelled, let self else { return }
                self.cities = resp.cities
                self.cityBreakCount = self.visibleCities.count
                self.refreshTagCounts()
            } catch {
                guard !(error is CancellationError) else { return }
                print("Failed to load cities:", error)
            }
        }
    }

    /// `YYYY-MM-DD` (Europe/Warsaw) for a day offset, matching `dayRange`.
    func dayIso(offset: Int) -> String {
        let (from, _) = dayRange(offset: offset)
        return AppConstants.isoDayFormatter.string(from: Date(timeIntervalSince1970: TimeInterval(from) / 1000))
    }

    var anchorDate: Date {
        let (from, _) = dayRange(offset: selectedDayOffset)
        return Date(timeIntervalSince1970: TimeInterval(from) / 1000)
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
            showtimes: nil, showtime_booking: nil, travelPin: pinStyle, tags: [tag], distinction: nil, source: provider
        )
    }

    /// Pin look: a match takes both team colours and the stadium glyph, a run
    /// takes its distance palette and the runner glyph.
    var pinStyle: TravelPinStyle? {
        if isRun {
            let (start, end) = RunPalette.gradientHex(for: self)
            return TravelPinStyle(icon: "figure.run", startHex: start, endHex: end)
        }
        return TravelPinStyle(
            icon: "sportscourt.fill",
            startHex: PinHex.value(metaData?.homeColor) ?? 0x0d48bd,
            endHex: PinHex.value(metaData?.awayColor) ?? 0xc6007e
        )
    }
}
