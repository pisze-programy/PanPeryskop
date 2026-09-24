import SwiftUI
import MapKit

@MainActor
class MapViewModel: ObservableObject, MapContentProvider, StoryActions {
    @Published var posts: [Post] = []
    @Published var isLoading = false
    @Published var selectedCity: City = CatalogueStore.shared.defaultCity
    /// Canonical event tags for the map filter chips (backend order).
    @Published var tags: [TagPill] = []
    /// Selected tag filter (all by default, at least one stays on), persisted.
    @Published private var tagSelection = MultiTagSelection(prefsKey: MapPrefs.selectedTags)
    // Selected day offset 0…3 (dziś / jutro / +2 / +3). Kept only as a live variable
    // (no persistence) — resets to today on a fresh launch, survives view switches.
    @Published var selectedDayOffset: Int = 0
    /// Event-count badge per tag id for the selected day+city (city scope, not viewport).
    /// Refreshed on app-start and city/day/category/tag change — seeds change rarely, never polled.
    @Published var tagCounts: [String: Int] = [:]

    /// nil = no tag filter (all tags selected, or not loaded yet).
    private var tagFilterParam: String? {
        tagSelection.param(all: Set(tags.map(\.id)))
    }
    var currentUserId: String?
    private var viewport: MapBBox?
    /// Downloaded 50 km squares, newest first (max `maxSquares`). Moving inside a
    /// square never refetches; leaving it downloads only the new squares. Cleared
    /// when the day or tags change.
    private var squares: [String: [String: Post]] = [:]
    private var squaresOrder: [String] = []
    /// Posts fetched directly (deep link) — not tied to a square.
    private var extraPosts: [String: Post] = [:]
    private var knownPostIds: Set<String> = []
    private var pollingTask: Task<Void, Never>?
    private var inFlightSquares: Set<String> = []
    private var isRegionFetchPending = false
    private var isCityTransitionPending = false
    private var cityTransitionTask: Task<Void, Never>?
    private static let squareSize = 0.45
    /// A full zoom-out covers many squares; the cap must fit them, and a visible
    /// square is never evicted (see `pruneSquares`).
    private static let maxSquares = 64

    private enum MapPrefs {
        static let cityId = "map.last_city_id"
        static let selectedTags = "map.selected_tags"
        static let selectedDay = "map.selected_day"
        static let vpLat = "map.viewport.lat"
        static let vpLng = "map.viewport.lng"
        static let vpSpanLat = "map.viewport.span_lat"
        static let vpSpanLng = "map.viewport.span_lng"

        static var viewportKeys: [String] { [vpLat, vpLng, vpSpanLat, vpSpanLng] }
    }

    init() {
        let savedCityId = UserDefaults.standard.string(forKey: MapPrefs.cityId)
        selectedCity = CatalogueStore.shared.city(id: savedCityId ?? "") ?? CatalogueStore.shared.defaultCity
        selectedDayOffset = min(StoredDay.loadOffset(key: MapPrefs.selectedDay) ?? 0, Self.maxDayOffset)
        loadTags()
        loadTagCounts()
    }

    // MARK: - Tag filter (events only)

    private static let tagsCacheKey = "tags.cache"

    /// Fetch the canonical tag list once at startup; cache in UserDefaults and
    /// overwrite it whenever fresh data arrives. On a network failure fall back
    /// to the cached list so the chips still render.
    @MainActor
    func loadTags() {
        Task {
            if let cached = UserDefaults.standard.string(forKey: Self.tagsCacheKey),
               let data = cached.data(using: .utf8),
               let decoded = try? JSONDecoder().decode(TagsResponse.self, from: data),
                !decoded.tags.isEmpty {
                tags = decoded.tags
                tagSelection.sync(all: Set(tags.map(\.id)))
            }
            do {
                let resp: TagsResponse = try await APIClient.get("/stories/tags")
                tags = resp.tags
                tagSelection.sync(all: Set(tags.map(\.id)))
                if let data = try? JSONEncoder().encode(resp),
                   let json = String(data: data, encoding: .utf8) {
                    UserDefaults.standard.set(json, forKey: Self.tagsCacheKey)
                }
            } catch {
                print("Failed to load tags:", error)
            }
        }
    }

    /// Toggle one tag. The last selected tag cannot be turned off.
    func toggleTag(_ id: String) {
        tagSelection.toggle(id)
        clearFeed()
        refreshCurrentRegion()
    }

    func isTagSelected(_ id: String) -> Bool { tagSelection.isSelected(id) }

    // MARK: - Tag count badges (events, per city+day)

    /// Fetch per-tag event counts for the current city + day. City-scoped (not the
    /// viewport), so it needs its own endpoint. No timer — counts change only on
    /// app-start and city/day/category/tag changes.
    @MainActor
    func loadTagCounts() {
        Task {
            struct TagCount: Decodable { let tag: String; let count: Int }
            struct TagCountsResponse: Decodable { let total: Int; let counts: [TagCount] }
            guard let resp: TagCountsResponse = try? await APIClient.get(
                "/stories/tag-counts",
                params: ["city": selectedCity.id, "day": dayString(offset: selectedDayOffset)]
            ) else { return }
            tagCounts = Dictionary(uniqueKeysWithValues: resp.counts.map { ($0.tag, $0.count) })
        }
    }

    /// Tags ordered for the filter chips (see `TagSorting` for the rules).
    var sortedTags: [TagPill] {
        TagSorting.sorted(tags, counts: tagCounts)
    }

    var restoredViewport: MKCoordinateRegion? {
        let d = UserDefaults.standard
        guard d.object(forKey: MapPrefs.vpLat) != nil else { return nil }
        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(
                latitude: d.double(forKey: MapPrefs.vpLat),
                longitude: d.double(forKey: MapPrefs.vpLng)
            ),
            span: MKCoordinateSpan(
                latitudeDelta: d.double(forKey: MapPrefs.vpSpanLat),
                longitudeDelta: d.double(forKey: MapPrefs.vpSpanLng)
            )
        )
    }

    var initialRegion: MKCoordinateRegion {
        restoredViewport ?? selectedCity.region
    }

    func saveViewport(_ region: MKCoordinateRegion) {
        let d = UserDefaults.standard
        d.set(region.center.latitude, forKey: MapPrefs.vpLat)
        d.set(region.center.longitude, forKey: MapPrefs.vpLng)
        d.set(region.span.latitudeDelta, forKey: MapPrefs.vpSpanLat)
        d.set(region.span.longitudeDelta, forKey: MapPrefs.vpSpanLng)
    }

    func onRegionChange(swLat: Double, swLng: Double, neLat: Double, neLng: Double) {
        viewport = MapBBox(swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng)
        isRegionFetchPending = true
        scheduleVisibleFetch(debounced: true)
    }

    func onCameraSettled(_ region: MKCoordinateRegion) {
        saveViewport(region)
    }

    var allPosts: [Post] {
        // Day browsing (offset>0) skips the TTL/future window — the server already
        // scoped the response to the requested event_date (future days have
        // created_at in the future and would otherwise be dropped client-side).
        let dayBrowse = selectedDayOffset > 0
        var byId: [String: Post] = [:]
        for dict in squares.values { for (id, post) in dict { byId[id] = post } }
        for (id, post) in extraPosts { byId[id] = post }
        return byId.values.filter {
            ($0.isRestaurant || (dayBrowse ? true : $0.isStillValid))
                && Self.isMapCategory($0.category)
        }
    }

    /// Map shows seed events plus the evergreen curated restaurants.
    private static func isMapCategory(_ category: String?) -> Bool {
        let value = category ?? AppConstants.categoryEvents
        return value == AppConstants.categoryEvents || value == AppConstants.categoryFood
    }

    var maxZoomOutDistance: CLLocationDistance { 100_000 }

    var clusterConfig: ClusterConfig { .local }

    var overlays: [MapOverlay] {
        allPosts.map { .pin(MapPin(post: $0)) }
    }

    /// YYYY-MM-DD (Europe/Warsaw) for a day offset relative to today.
    func dayString(offset: Int) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Warsaw")!
        let date = calendar.date(byAdding: .day, value: offset, to: Date()) ?? Date()
        let f = DateFormatter()
        f.calendar = calendar
        f.locale = Locale(identifier: "pl_PL")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    /// Day-browser range, shared by the slider and the day sheet.
    static let minDayOffset = 0
    static let maxDayOffset = 5
    static var dayOffsets: [Int] { Array(minDayOffset...maxDayOffset) }

    func commitDay(_ offset: Int) {
        guard selectedDayOffset != offset else { return }
        selectedDayOffset = offset
        StoredDay.save(offset: offset, key: MapPrefs.selectedDay)
        clearFeed()
        refreshCurrentRegion()
        loadTagCounts()
    }

    func refreshCurrentRegion() {
        let box = viewport ?? Self.bbox(for: selectedCity.region)
        fetchStories(swLat: box.swLat, swLng: box.swLng, neLat: box.neLat, neLng: box.neLng)
    }

    private var debounceTask: Task<Void, Never>?

    /// Re-resolve the selected city after the catalogue changes (refresh).
    func reloadCities() {
        selectedCity = CatalogueStore.shared.city(id: selectedCity.id) ?? CatalogueStore.shared.defaultCity
    }

    func selectCity(_ city: City) {
        selectedCity = city
        UserDefaults.standard.set(city.id, forKey: MapPrefs.cityId)
        MapPrefs.viewportKeys.forEach { UserDefaults.standard.removeObject(forKey: $0) }
        clearFeed()
        let region = city.region
        let swLat = region.center.latitude - region.span.latitudeDelta / 2
        let swLng = region.center.longitude - region.span.longitudeDelta / 2
        let neLat = region.center.latitude + region.span.latitudeDelta / 2
        let neLng = region.center.longitude + region.span.longitudeDelta / 2
        fetchStories(swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng)
        startCityTransition()
        loadTagCounts()
    }

    private func startCityTransition() {
        isCityTransitionPending = true
        cityTransitionTask?.cancel()
        cityTransitionTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            guard !Task.isCancelled else { return }
            self?.isCityTransitionPending = false
        }
    }

    func fetchStories(swLat: Double, swLng: Double, neLat: Double, neLng: Double) {
        viewport = MapBBox(swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng)
        isRegionFetchPending = true
        scheduleVisibleFetch(debounced: false)
    }

    private func scheduleVisibleFetch(debounced: Bool) {
        debounceTask?.cancel()
        debounceTask = Task { [weak self] in
            guard let self else { return }
            if debounced {
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
            guard !Task.isCancelled else { return }
            await self.fetchVisibleSquares(refresh: false, trackLoad: true)
            self.isRegionFetchPending = false
        }
    }

    /// Download the 50 km squares that are on screen. `refresh` replaces squares we
    /// already have (the poll); otherwise only the missing ones are fetched.
    @discardableResult
    private func fetchVisibleSquares(refresh: Bool, trackLoad: Bool) async -> [Post] {
        guard let viewport else { return [] }
        let ids = Self.squareIds(in: viewport)
        let visible = Set(ids)
        let targets = ids.filter { !inFlightSquares.contains($0) && (refresh || squares[$0] == nil) }
        guard !targets.isEmpty else {
            pruneSquares(keeping: visible)
            return []
        }
        inFlightSquares.formUnion(targets)
        defer { inFlightSquares.subtract(targets) }
        if trackLoad { startUserLoad() }
        let token = feedToken
        var fetched: [Post] = []
        for id in targets {
            fetched.append(contentsOf: await fetchSquare(id, token: token))
        }
        pruneSquares(keeping: visible)
        if trackLoad { knownPostIds.formUnion(fetched.map(\.id)) }
        if trackLoad { await finishUserLoad() }
        return fetched
    }

    private var feedToken: String {
        "\(selectedDayOffset)|\(tagFilterParam ?? "all")"
    }

    @discardableResult
    private func fetchSquare(_ id: String, token: String) async -> [Post] {
        guard let box = Self.squareBox(id) else { return [] }
        var params = [
            "sw_lat": String(box.swLat),
            "sw_lng": String(box.swLng),
            "ne_lat": String(box.neLat),
            "ne_lng": String(box.neLng),
            "category": AppConstants.categoryEvents,
            "limit": "1000",
        ]
        if selectedDayOffset > 0 {
            params["day"] = dayString(offset: selectedDayOffset)
        }
        if let tagFilterParam {
            params["tags"] = tagFilterParam
        }
        do {
            let resp: PostListResponse = try await APIClient.get("/stories", params: params)
            guard token == feedToken else { return [] } // filter changed mid-flight
            var dict: [String: Post] = [:]
            for post in resp.stories { dict[post.id] = post }
            squares[id] = dict
            posts = allPosts
            return resp.stories
        } catch {
            print("Failed to load stories:", error)
            return []
        }
    }

    /// Keep every visible square and drop only the oldest OFF-SCREEN ones beyond
    /// the cap. A visible square is never evicted, so a zoom-out can never blank
    /// the pins that are already on screen.
    private func pruneSquares(keeping visible: Set<String>) {
        squaresOrder.removeAll { visible.contains($0) }
        squaresOrder.insert(contentsOf: visible, at: 0)
        while squaresOrder.count > Self.maxSquares, let last = squaresOrder.last, !visible.contains(last) {
            squaresOrder.removeLast()
            squares.removeValue(forKey: last)
        }
    }

    private func clearFeed() {
        squares.removeAll()
        squaresOrder.removeAll()
        extraPosts.removeAll()
        knownPostIds.removeAll()
        posts = allPosts
    }

    private static func squareIds(in box: MapBBox) -> [String] {
        let la0 = Int(floor(box.swLat / squareSize))
        let la1 = Int(floor(box.neLat / squareSize))
        let lo0 = Int(floor(box.swLng / squareSize))
        let lo1 = Int(floor(box.neLng / squareSize))
        var out: [String] = []
        for la in la0...la1 {
            for lo in lo0...lo1 { out.append("\(la)_\(lo)") }
        }
        return out
    }

    private static func squareBox(_ id: String) -> MapBBox? {
        let parts = id.split(separator: "_")
        guard parts.count == 2, let la = Int(parts[0]), let lo = Int(parts[1]) else { return nil }
        let swLat = Double(la) * squareSize
        let swLng = Double(lo) * squareSize
        return MapBBox(swLat: swLat, swLng: swLng, neLat: swLat + squareSize, neLng: swLng + squareSize)
    }

    private static func bbox(for region: MKCoordinateRegion) -> MapBBox {
        MapBBox(
            swLat: region.center.latitude - region.span.latitudeDelta / 2,
            swLng: region.center.longitude - region.span.longitudeDelta / 2,
            neLat: region.center.latitude + region.span.latitudeDelta / 2,
            neLng: region.center.longitude + region.span.longitudeDelta / 2
        )
    }

    // MARK: - User-load indicator (day/city/tag changes — never the poll)

    private var loadingSince: Date?

    private func startUserLoad() {
        loadingSince = Date()
        if !isLoading { isLoading = true }
    }

    /// Keep the indicator up for at least `minLoadingIndicatorMs` so a fast
    /// response does not flash the spinner.
    private func finishUserLoad() async {
        guard isLoading else { return }
        if let since = loadingSince {
            let minS = Double(AppConstants.minLoadingIndicatorMs) / 1000
            let elapsed = Date().timeIntervalSince(since)
            if elapsed < minS {
                try? await Task.sleep(nanoseconds: UInt64((minS - elapsed) * 1_000_000_000))
            }
        }
        loadingSince = nil
        isLoading = false
    }

    private static let pollInterval: UInt64 = 20_000_000_000

    func startPolling() {
        stopPolling()
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: Self.pollInterval)
                guard !Task.isCancelled else { return }
                guard let self else { return }
                await self.pollStories()
            }
        }
    }

    func stopPolling() {
        pollingTask?.cancel()
        pollingTask = nil
    }

    private func pollStories() async {
        guard viewport != nil, !isRegionFetchPending, !isCityTransitionPending else { return }
        let fetched = await fetchVisibleSquares(refresh: true, trackLoad: false)
        guard !Task.isCancelled, !fetched.isEmpty else { return }
        let hasNew = fetched.contains {
            !knownPostIds.contains($0.id)
                && $0.user_id != currentUserId
        }
        knownPostIds.formUnion(fetched.map(\.id))
        if hasNew {
            ToastManager.shared.show("Nowe!")
        }
    }

    private func replacePost(_ post: Post) {
        for (id, dict) in squares where dict[post.id] != nil {
            var updated = dict
            updated[post.id] = post
            squares[id] = updated
            posts = allPosts
            return
        }
        if extraPosts[post.id] != nil {
            extraPosts[post.id] = post
            posts = allPosts
        }
    }

    func markWatched(_ postId: String) async {
        do {
            try await APIClient.postEmpty("/actions/\(postId)/watched")
            if let post = posts.first(where: { $0.id == postId }) {
                replacePost(post.with(watched: true))
            }
        } catch {
            print("Failed to mark watched:", error)
        }
    }

    func toggleLike(_ postId: String) async -> Bool {
        do {
            struct LikeResp: Codable { let liked: Bool }
            let resp: LikeResp = try await APIClient.postEmptyBody("/actions/\(postId)/like")
            if let post = posts.first(where: { $0.id == postId }) {
                replacePost(post.with(
                    liked: resp.liked,
                    likesCount: resp.liked ? post.likes_count + 1 : max(0, post.likes_count - 1)
                ))
            }
            return resp.liked
        } catch {
            print("Failed to toggle like:", error)
            return false
        }
    }

    func toggleDislike(_ postId: String) async -> Bool {
        do {
            struct DislikeResp: Codable { let disliked: Bool }
            let resp: DislikeResp = try await APIClient.postEmptyBody("/actions/\(postId)/dislike")
            if let post = posts.first(where: { $0.id == postId }) {
                replacePost(post.with(
                    disliked: resp.disliked,
                    dislikesCount: resp.disliked ? post.dislikes_count + 1 : max(0, post.dislikes_count - 1)
                ))
            }
            return resp.disliked
        } catch {
            print("Failed to toggle dislike:", error)
            return false
        }
    }

    func sharePost(_ postId: String) async {
        do {
            try await APIClient.postEmpty("/actions/\(postId)/share")
        } catch {
            print("Failed to share:", error)
        }
    }

    func ensurePost(id: String) async -> Post? {
        if let existing = posts.first(where: { $0.id == id }) {
            return existing
        }
        do {
            let post: Post = try await APIClient.get("/posts/\(id)")
            extraPosts[post.id] = post
            posts = allPosts
            return post
        } catch {
            print("Failed to fetch post \(id):", error)
            return nil
        }
    }

}
