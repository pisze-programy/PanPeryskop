import SwiftUI
import MapKit

@MainActor
class MapViewModel: ObservableObject, MapContentProvider, StoryActions {
    @Published var posts: [Post] = []
    @Published var isLoading = false
    @Published var selectedCity: City = City.all[0]
    @Published var feedCategory: MapCategory = .events
    /// Live filter — shows UGC recordings (posts.category=live) instead of events.
    @Published var isLive = false
    /// Canonical event tags for the map filter chips (backend order).
    @Published var tags: [TagPill] = []
    /// Active tag filter — nil = all approved events. Session-only (never persisted).
    @Published var selectedTag: String?
    // Selected day offset 0…3 (dziś / jutro / +2 / +3). Kept only as a live variable
    // (no persistence) — resets to today on a fresh launch, survives view switches.
    @Published var selectedDayOffset: Int = 0
    /// Event-count badge per tag id for the selected day+city (city scope, not viewport).
    /// Refreshed on app-start and city/day/category/tag change — seeds change rarely, never polled.
    @Published var tagCounts: [String: Int] = [:]
    /// Total approved events for the selected day+city ("Wszystkie" badge).
    @Published var tagTotalCount: Int = 0
    /// Approved live posts in the city (Live chip badge) — TTL window, not day-scoped.
    @Published var liveCount: Int = 0

    private var serverPosts: [Post] = []
    /// Merged post cache per (category, day, tag) — panning/zooming never drops
    /// already-loaded pins; the 20s polling completes the cache and new pins appear.
    private var postsCache: [PostsCacheKey: [String: Post]] = [:]
    private var postsCacheKey: PostsCacheKey {
        PostsCacheKey(
            category: feedCategory,
            isLive: isLive,
            day: isLive ? nil : dayString(offset: selectedDayOffset),
            tag: selectedTag
        )
    }
    var currentUserId: String? {
        didSet { MediaNearbyNotifier.persistCurrentUserId(currentUserId) }
    }
    private var viewport: MapBBox?
    private var knownPostIds: Set<String> = []
    private var pollingTask: Task<Void, Never>?
    private var isFetchingStories = false
    private var isRegionFetchPending = false
    private var isCityTransitionPending = false
    private var cityTransitionTask: Task<Void, Never>?

    private enum MapPrefs {
        static let cityId = "map.last_city_id"
        static let vpLat = "map.viewport.lat"
        static let vpLng = "map.viewport.lng"
        static let vpSpanLat = "map.viewport.span_lat"
        static let vpSpanLng = "map.viewport.span_lng"

        static var viewportKeys: [String] { [vpLat, vpLng, vpSpanLat, vpSpanLng] }
    }

    init() {
        let savedCityId = UserDefaults.standard.string(forKey: MapPrefs.cityId)
        selectedCity = City.all.first { $0.id == savedCityId } ?? City.all[0]
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
            }
            do {
                let resp: TagsResponse = try await APIClient.get("/stories/tags")
                tags = resp.tags
                if let data = try? JSONEncoder().encode(resp),
                   let json = String(data: data, encoding: .utf8) {
                    UserDefaults.standard.set(json, forKey: Self.tagsCacheKey)
                }
            } catch {
                print("Failed to load tags:", error)
            }
        }
    }

    /// Toggle a tag on/off — selecting the active tag returns to "all" (nil).
    /// Session-only; survives category switches, profile/story navigation.
    func toggleTag(_ id: String) {
        isLive = false
        selectedTag = (selectedTag == id) ? nil : id
        refreshCurrentRegion()
        loadTagCounts()
    }

    /// Back to "Wszystkie" (no tag, no Live). Already "all" → no-op.
    func selectAll() {
        guard isLive || selectedTag != nil else { return }
        isLive = false
        selectedTag = nil
        refreshCurrentRegion()
        loadTagCounts()
    }

    /// Live filter — show UGC recordings instead of events.
    func selectLive() {
        guard !isLive else { return }
        isLive = true
        selectedTag = nil
        refreshCurrentRegion()
        loadTagCounts()
    }

    // MARK: - Tag count badges (events, per city+day)

    /// Fetch per-tag event counts for the current city + day. City-scoped (not the
    /// viewport), so it needs its own endpoint. No timer — counts change only on
    /// app-start and city/day/category/tag changes.
    @MainActor
    func loadTagCounts() {
        Task {
            struct TagCount: Decodable { let tag: String; let count: Int }
            struct TagCountsResponse: Decodable { let total: Int; let counts: [TagCount]; let live: Int? }
            guard let resp: TagCountsResponse = try? await APIClient.get(
                "/stories/tag-counts",
                params: ["city": selectedCity.id, "day": dayString(offset: selectedDayOffset)]
            ) else { return }
            tagTotalCount = resp.total
            tagCounts = Dictionary(uniqueKeysWithValues: resp.counts.map { ($0.tag, $0.count) })
            liveCount = resp.live ?? 0
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
        fetchStories(swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng)
    }

    func onCameraSettled(_ region: MKCoordinateRegion) {
        saveViewport(region)
    }

    var allPosts: [Post] {
        // Day browsing (offset>0) skips the TTL/future window — the server already
        // scoped the response to the requested event_date (future days have
        // created_at in the future and would otherwise be dropped client-side).
        let dayBrowse = !isLive && selectedDayOffset > 0
        let backendCategory = isLive ? AppConstants.categoryLive : AppConstants.categoryEvents
        return serverPosts.filter {
            (dayBrowse ? true : $0.isStillValid)
                && ($0.category ?? AppConstants.categoryEvents) == backendCategory
        }
    }

    var defaultZoom: Double { 12 }

    var maxZoomOutDistance: CLLocationDistance { 100_000 }

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

    /// Commit the selected day (called on slider release) → refetch the viewport.
    func commitDay(_ offset: Int) {
        guard selectedDayOffset != offset else { return }
        selectedDayOffset = offset
        refreshCurrentRegion()
        loadTagCounts()
    }

    func refreshCurrentRegion() {
        guard let viewport else { return }
        fetchStories(swLat: viewport.swLat, swLng: viewport.swLng, neLat: viewport.neLat, neLng: viewport.neLng)
    }

    func selectFeedCategory(_ category: MapCategory) {
        feedCategory = category
        isLive = false
        refreshCurrentRegion()
        loadTagCounts()
    }

    private var debounceTask: Task<Void, Never>?

    func selectCity(_ city: City) {
        selectedCity = city
        UserDefaults.standard.set(city.id, forKey: MapPrefs.cityId)
        MapPrefs.viewportKeys.forEach { UserDefaults.standard.removeObject(forKey: $0) }
        let region = city.region
        let swLat = region.center.latitude - region.span.latitudeDelta / 2
        let swLng = region.center.longitude - region.span.longitudeDelta / 2
        let neLat = region.center.latitude + region.span.latitudeDelta / 2
        let neLng = region.center.longitude + region.span.longitudeDelta / 2
        fetchStories(swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng)
        startCityTransition()
        runMediaNearbyCheck()
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
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled else { return }
            if let fetched = await loadStories(swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng) {
                knownPostIds = Set(fetched.map(\.id))
            }
            isRegionFetchPending = false
        }
    }

    @discardableResult
    private func loadStories(swLat: Double, swLng: Double, neLat: Double, neLng: Double) async -> [Post]? {
        guard !isFetchingStories else { return nil }
        isFetchingStories = true
        defer { isFetchingStories = false }
        // Freeze the (category, day, tag) the request was issued for. The user may
        // switch day/category/tag while the fetch is in flight — a stale response
        // must NOT land in the current cache bucket (that leaked tomorrow/+2 pins
        // into "today"). Compare after the await and drop if the state changed.
        let key = postsCacheKey
        let isLiveForRequest = isLive
        var params = [
            "sw_lat": String(swLat),
            "sw_lng": String(swLng),
            "ne_lat": String(neLat),
            "ne_lng": String(neLng),
        ]
        if isLiveForRequest {
            params["category"] = AppConstants.categoryLive
            params["limit"] = "1000"
        } else {
            params["category"] = AppConstants.categoryEvents
            // Day browsing: fetch that day's events (all pins; the map clusters them).
            if selectedDayOffset > 0 {
                params["day"] = dayString(offset: selectedDayOffset)
                params["limit"] = "1000"
            }
            // Tag filter — events only; the backend validates the tag + keeps status=approved.
            if let selectedTag {
                params["tag"] = selectedTag
            }
        }
        do {
            let resp: PostListResponse = try await APIClient.get("/stories", params: params)
            guard key == postsCacheKey else { return nil } // stale — day/category/tag changed mid-flight
            var bucket = postsCache[postsCacheKey] ?? [:]
            for p in resp.stories { bucket[p.id] = p }
            postsCache[postsCacheKey] = bucket
            serverPosts = Array(bucket.values)
            posts = allPosts
            return resp.stories
        } catch {
            print("Failed to load stories:", error)
            return nil
        }
    }

    private static let pollInterval: UInt64 = 20_000_000_000

    func startPolling() {
        stopPolling()
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: Self.pollInterval)
                guard !Task.isCancelled else { return }
                guard let self else { return }
                ProximityMonitor.shared.updateLocationTrackingIfNeeded()
                let mediaDelivered = await MediaNearbyNotifier.shared.pollForeground(city: self.selectedCity)
                await self.pollStories(suppressToast: mediaDelivered)
            }
        }
    }

    func stopPolling() {
        pollingTask?.cancel()
        pollingTask = nil
    }

    /// Immediate media-nearby check (map appear / city switch) + location tracking sync.
    func runMediaNearbyCheck() {
        ProximityMonitor.shared.updateLocationTrackingIfNeeded()
        Task { [weak self] in
            guard let self else { return }
            await MediaNearbyNotifier.shared.pollForeground(city: self.selectedCity)
        }
    }

    private func pollStories(suppressToast: Bool = false) async {
        guard let viewport, !isRegionFetchPending, !isCityTransitionPending else { return }
        guard let fetched = await loadStories(
            swLat: viewport.swLat, swLng: viewport.swLng,
            neLat: viewport.neLat, neLng: viewport.neLng
        ) else { return }
        guard !Task.isCancelled else { return }
        let hasNew = fetched.contains {
            !knownPostIds.contains($0.id)
                && $0.user_id != currentUserId
        }
        knownPostIds.formUnion(fetched.map(\.id))
        if hasNew && !suppressToast {
            ToastManager.shared.show("Nowe!")
        }
    }

    func markWatched(_ postId: String) async {
        do {
            try await APIClient.postEmpty("/actions/\(postId)/watched")
            if let idx = serverPosts.firstIndex(where: { $0.id == postId }) {
                serverPosts[idx] = serverPosts[idx].with(watched: true)
                posts = allPosts
            }
        } catch {
            print("Failed to mark watched:", error)
        }
    }

    func toggleLike(_ postId: String) async -> Bool {
        do {
            struct LikeResp: Codable { let liked: Bool }
            let resp: LikeResp = try await APIClient.postEmptyBody("/actions/\(postId)/like")
            if let idx = posts.firstIndex(where: { $0.id == postId }) {
                posts[idx] = posts[idx].with(
                    liked: resp.liked,
                    likesCount: resp.liked ? posts[idx].likes_count + 1 : max(0, posts[idx].likes_count - 1)
                )
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
            if let idx = posts.firstIndex(where: { $0.id == postId }) {
                posts[idx] = posts[idx].with(
                    disliked: resp.disliked,
                    dislikesCount: resp.disliked ? posts[idx].dislikes_count + 1 : max(0, posts[idx].dislikes_count - 1)
                )
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
            var bucket = postsCache[postsCacheKey] ?? [:]
            bucket[post.id] = post
            postsCache[postsCacheKey] = bucket
            serverPosts = Array(bucket.values)
            posts = allPosts
            return post
        } catch {
            print("Failed to fetch post \(id):", error)
            return nil
        }
    }

}
