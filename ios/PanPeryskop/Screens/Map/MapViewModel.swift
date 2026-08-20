import SwiftUI
import CoreLocation
import MapKit

struct MapBBox {
    let swLat: Double
    let swLng: Double
    let neLat: Double
    let neLng: Double

    func contains(lat: Double, lng: Double) -> Bool {
        lat >= swLat && lat <= neLat && lng >= swLng && lng <= neLng
    }
}

/// Content category shown on the map. Matches the backend `category` enum.
enum FeedCategory: String, CaseIterable, Identifiable {
    case events, live
    var id: String { rawValue }
    var label: String { self == .events ? "Wydarzenia" : "Live" }
}

@MainActor
class MapViewModel: ObservableObject {
    @Published var posts: [Post] = []
    @Published var mediaRequests: [MediaRequest] = []
    @Published var isLoading = false
    @Published var selectedCity: City = City.all[0]
    @Published var feedCategory: FeedCategory = .events
    /// Canonical event tags for the map filter chips (backend order).
    @Published var tags: [TagPill] = []
    /// Active tag filter — nil = all approved events. Session-only (never persisted).
    @Published var selectedTag: String?
    // Selected day offset 0…3 (dziś / jutro / +2 / +3). Kept only as a live variable
    // (no persistence) — resets to today on a fresh launch, survives view switches.
    @Published var selectedDayOffset: Int = 0

    private var serverPosts: [Post] = []
    private var serverRequests: [MediaRequest] = []
    /// Merged post cache per (category, day, tag) — panning/zooming never drops
    /// already-loaded pins; the 20s polling completes the cache and new pins appear.
    private var postsCache: [String: [String: Post]] = [:]
    private var postsCacheKey: String {
        let day = feedCategory == .events ? dayString(offset: selectedDayOffset) : "live"
        return "\(feedCategory.rawValue)|\(day)|\(selectedTag ?? "")"
    }
    var currentUserId: String? {
        didSet { MediaNearbyNotifier.persistCurrentUserId(currentUserId) }
    }
    private var viewport: MapBBox?
    private var knownPostIds: Set<String> = []
    private var knownRequestIds: Set<String> = []
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
        selectedTag = (selectedTag == id) ? nil : id
        refreshCurrentRegion()
    }

    /// Back to "Wszystkie" (no tag filter). Already "all" → no-op (no refetch);
    /// otherwise clears the selection and refetches so all approved pins return.
    func selectAll() {
        guard selectedTag != nil else { return }
        selectedTag = nil
        refreshCurrentRegion()
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

    var allPosts: [Post] {
        // Day browsing (offset>0) skips the TTL/future window — the server already
        // scoped the response to the requested event_date (future days have
        // created_at in the future and would otherwise be dropped client-side).
        let dayBrowse = feedCategory == .events && selectedDayOffset > 0
        return serverPosts.filter {
            (dayBrowse ? true : $0.isStillValid)
                && ($0.category ?? "live") == feedCategory.rawValue
                && (feedCategory != .live || !$0.watched)
        }
    }

    var defaultZoom: Double { 12 }

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
    }

    func refreshCurrentRegion() {
        guard let viewport else { return }
        fetchStories(swLat: viewport.swLat, swLng: viewport.swLng, neLat: viewport.neLat, neLng: viewport.neLng)
    }

    func selectFeedCategory(_ category: FeedCategory) {
        guard feedCategory != category else { return }
        feedCategory = category
        refreshCurrentRegion()
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
        var params = [
            "sw_lat": String(swLat),
            "sw_lng": String(swLng),
            "ne_lat": String(neLat),
            "ne_lng": String(neLng),
            "category": feedCategory.rawValue,
        ]
        // Day browsing: fetch that day's events (all pins; the map clusters them).
        if feedCategory == .events, selectedDayOffset > 0 {
            params["day"] = dayString(offset: selectedDayOffset)
            params["limit"] = "1000"
        }
        // Tag filter — events only; the backend validates the tag + keeps status=approved.
        if feedCategory == .events, let selectedTag {
            params["tag"] = selectedTag
        }
        do {
            let resp: PostListResponse = try await APIClient.get("/stories", params: params)
            var bucket = postsCache[postsCacheKey] ?? [:]
            for p in resp.stories { bucket[p.id] = p }
            postsCache[postsCacheKey] = bucket
            serverPosts = Array(bucket.values)
            posts = allPosts
            // Request pins ("?") are a Live-category feature — not shown in Wydarzenia.
            if feedCategory == .live,
               let requestsResp = try? await APIClient.getMediaRequests(
                   swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng
               ) {
                serverRequests = requestsResp.requests
                mediaRequests = serverRequests.filter { $0.isStillValid }
                knownRequestIds = Set(mediaRequests.map(\.id))
                ProximityMonitor.shared.sync(requests: mediaRequests, currentUserId: currentUserId)
            } else {
                mediaRequests = []
                ProximityMonitor.shared.sync(requests: [], currentUserId: currentUserId)
            }
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
                serverPosts[idx] = withWatched(true, serverPosts[idx])
                posts = allPosts
            }
        } catch {
            print("Failed to mark watched:", error)
        }
    }

    private func withWatched(_ watched: Bool, _ post: Post) -> Post {
        Post(
            id: post.id, user_id: post.user_id, type: post.type,
            lat: post.lat, lng: post.lng, description: post.description,
            media_key: post.media_key, thumb_key: post.thumb_key,
            created_at: post.created_at,
            likes_count: post.likes_count, views_count: post.views_count, shares_count: post.shares_count,
            dislikes_count: post.dislikes_count,
            grid_cell_id: post.grid_cell_id,
            liked: post.liked, disliked: post.disliked, watched: watched,
            author_name: post.author_name, media_url: post.media_url, thumb_url: post.thumb_url,
            author_avatar_url: post.author_avatar_url,
            is_sponsored: post.is_sponsored, category: post.category, link_url: post.link_url, is_sold_out: post.is_sold_out, showtimes: post.showtimes, showtime_booking: post.showtime_booking
        )
    }

    func toggleLike(_ postId: String) async -> Bool {
        do {
            struct LikeResp: Codable { let liked: Bool }
            let resp: LikeResp = try await APIClient.postEmptyBody("/actions/\(postId)/like")
            if let idx = posts.firstIndex(where: { $0.id == postId }) {
                var updated = posts[idx]
                updated = Post(
                    id: updated.id, user_id: updated.user_id, type: updated.type,
                    lat: updated.lat, lng: updated.lng, description: updated.description,
                    media_key: updated.media_key, thumb_key: updated.thumb_key,
                    created_at: updated.created_at,
                    likes_count: resp.liked ? updated.likes_count + 1 : max(0, updated.likes_count - 1),
                    views_count: updated.views_count, shares_count: updated.shares_count,
                    dislikes_count: updated.dislikes_count,
                    grid_cell_id: updated.grid_cell_id,
                    liked: resp.liked, disliked: updated.disliked, watched: updated.watched,
                    author_name: updated.author_name, media_url: updated.media_url, thumb_url: updated.thumb_url,
                    author_avatar_url: updated.author_avatar_url,
                    is_sponsored: updated.is_sponsored, category: updated.category, link_url: updated.link_url, is_sold_out: updated.is_sold_out, showtimes: updated.showtimes, showtime_booking: updated.showtime_booking
                )
                posts[idx] = updated
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
                var updated = posts[idx]
                updated = Post(
                    id: updated.id, user_id: updated.user_id, type: updated.type,
                    lat: updated.lat, lng: updated.lng, description: updated.description,
                    media_key: updated.media_key, thumb_key: updated.thumb_key,
                    created_at: updated.created_at,
                    likes_count: updated.likes_count, views_count: updated.views_count, shares_count: updated.shares_count,
                    dislikes_count: resp.disliked ? updated.dislikes_count + 1 : max(0, updated.dislikes_count - 1),
                    grid_cell_id: updated.grid_cell_id,
                    liked: updated.liked, disliked: resp.disliked, watched: updated.watched,
                    author_name: updated.author_name, media_url: updated.media_url, thumb_url: updated.thumb_url,
                    author_avatar_url: updated.author_avatar_url,
                    is_sponsored: updated.is_sponsored, category: updated.category, link_url: updated.link_url, is_sold_out: updated.is_sold_out, showtimes: updated.showtimes, showtime_booking: updated.showtime_booking
                )
                posts[idx] = updated
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

    // MARK: - Media request pins

    private static let requestCooldown: TimeInterval = 30 * 60
    private static let requestCooldownKey = "mediaRequest.last_created_at"

    /// Server-authoritative timestamp (ms) of the user's last placed pin (cache of POST /media-requests).
    private var lastRequestCreatedAt: Int64? {
        UserDefaults.standard.object(forKey: Self.requestCooldownKey) as? Int64
    }

    /// Seconds until the user may place another pin, based on the local cache. 0 = allowed.
    func requestCooldownSeconds() -> TimeInterval {
        guard let last = lastRequestCreatedAt else { return 0 }
        let elapsed = Date().timeIntervalSince1970 - TimeInterval(last) / 1000
        return max(0, Self.requestCooldown - elapsed)
    }

    /// Places a pin via the backend. On 429 the returned cooldown is stored in the local cache
    /// (so the next long-press shows the informational alert without a round-trip).
    func submitRequestPin(at coordinate: CLLocationCoordinate2D) async -> RequestDropResult {
        do {
            let request = try await APIClient.createMediaRequest(lat: coordinate.latitude, lng: coordinate.longitude)
            UserDefaults.standard.set(request.created_at, forKey: Self.requestCooldownKey)
            serverRequests.append(request)
            mediaRequests = serverRequests.filter { $0.isStillValid }
            ProximityMonitor.shared.sync(requests: mediaRequests, currentUserId: currentUserId)
            return .success(request)
        } catch APIError.cooldown(let minutes) {
            let remaining = TimeInterval((minutes ?? 30) * 60)
            // Encode the server-reported remaining time into the local cache:
            // remaining = lastCreatedAt + 30min - now  →  lastCreatedAt = now - (30min - remaining)
            let lastTs = Int64(Date().timeIntervalSince1970 * 1000) - Int64((Self.requestCooldown - remaining) * 1000)
            UserDefaults.standard.set(lastTs, forKey: Self.requestCooldownKey)
            return .cooldown(remainingMinutes: minutes ?? 30)
        } catch {
            print("Failed to place media request pin:", error)
            return .failure
        }
    }
}

/// Result of placing a media-request pin.
enum RequestDropResult {
    case success(MediaRequest)
    case cooldown(remainingMinutes: Int)
    case failure
}
