import SwiftUI
import MapKit

@MainActor
class MapViewModel: ObservableObject, MapContentProvider, StoryActions {
    @Published var posts: [Post] = []
    @Published var isLoading = false
    @Published var selectedCity: City = CatalogueStore.shared.defaultCity
    @Published var tags: [TagPill] = []
    @Published private var tagSelection = MultiTagSelection(prefsKey: MapPrefs.selectedTags)
    @Published var selectedDayOffset: Int = 0
    @Published var tagCounts: [String: Int] = [:]

    private var tagFilterParam: String? {
        tagSelection.param(all: Set(tags.map(\.id)))
    }
    var selectedTagsParam: String? { tagFilterParam }
    static let cityRadiusDegrees = 0.2

    static func cityBBox(for city: City) -> MapBBox {
        MapBBox(
            swLat: city.lat - cityRadiusDegrees,
            swLng: city.lng - cityRadiusDegrees,
            neLat: city.lat + cityRadiusDegrees,
            neLng: city.lng + cityRadiusDegrees
        )
    }

    var currentUserId: String?
    private var viewport: MapBBox?
    private var squares: [String: [String: Post]] = [:]
    private var squaresOrder: [String] = []
    private var extraPosts: [String: Post] = [:]
    private var knownPostIds: Set<String> = []
    private var pollingTask: Task<Void, Never>?
    private var tagCountsTask: Task<Void, Never>?
    private var inFlightSquares: [String: InFlightSquare] = [:]
    private var feedGeneration = 0
    private var fetchSequence = 0
    private var isRegionFetchPending = false
    private var isCityTransitionPending = false
    private var cityTransitionTask: Task<Void, Never>?
    private nonisolated static let squareSize = 0.45
    // Visible squares are never evicted, so zoom-out needs a high cache cap.
    private static let maxSquares = 64

    private struct InFlightSquare {
        let flightID: UUID
        let isUser: Bool
    }

    private struct SquareFetchResult: Sendable {
        let id: String
        let stories: [Post]
    }

    private enum MapPrefs {
        static let cityId = "map.last_city_id"
        static let selectedTags = "map.selected_tags"
        static let selectedDay = "map.selected_day"
        static let vpLat = "map.viewport.lat"
        static let vpLng = "map.viewport.lng"
        static let vpSpanLat = "map.viewport.span_lat"
        static let vpSpanLng = "map.viewport.span_lng"
        static let vpCityId = "map.viewport.city_id"

        static var viewportKeys: [String] { [vpLat, vpLng, vpSpanLat, vpSpanLng, vpCityId] }
    }

    init() {
        let savedCityId = UserDefaults.standard.string(forKey: MapPrefs.cityId)
        selectedCity = CatalogueStore.shared.city(id: savedCityId ?? "") ?? CatalogueStore.shared.defaultCity
        selectedDayOffset = min(StoredDay.loadOffset(key: MapPrefs.selectedDay) ?? 0, Self.maxDayOffset)
        restoreCachedTags()
        loadTags()
        loadTagCounts()
    }

    private static let tagsCacheKey = "tags.cache"

    private func restoreCachedTags() {
        guard let cached = UserDefaults.standard.string(forKey: Self.tagsCacheKey),
              let data = cached.data(using: .utf8),
              let decoded = try? JSONDecoder().decode(TagsResponse.self, from: data),
              !decoded.tags.isEmpty else { return }
        tags = decoded.tags
        tagSelection.sync(all: Set(tags.map(\.id)))
    }

    private func cacheTags(_ response: TagsResponse) {
        guard let data = try? JSONEncoder().encode(response),
              let json = String(data: data, encoding: .utf8) else { return }
        UserDefaults.standard.set(json, forKey: Self.tagsCacheKey)
    }

    private func applyTags(_ response: TagsResponse) {
        let previousParam = tagFilterParam
        tags = response.tags
        tagSelection.sync(all: Set(tags.map(\.id)))
        cacheTags(response)
        guard previousParam != tagFilterParam, viewport != nil else { return }
        clearFeed()
        refreshCurrentRegion()
    }

    @MainActor
    func loadTags() {
        Task { [weak self] in
            let resp: TagsResponse
            do {
                resp = try await APIClient.get("/stories/tags")
            } catch {
                print("Failed to load tags:", error)
                return
            }
            guard !Task.isCancelled else { return }
            self?.applyTags(resp)
        }
    }

    func toggleTag(_ id: String) {
        tagSelection.toggle(id)
        clearFeed()
        guard viewport != nil else { return }
        scheduleVisibleFetch(debounced: true)
    }

    func isTagSelected(_ id: String) -> Bool { tagSelection.isSelected(id) }

    @MainActor
    func loadTagCounts() {
        tagCountsTask?.cancel()
        let cityId = selectedCity.id
        let dayOffset = selectedDayOffset
        let day = dayString(offset: dayOffset)
        tagCountsTask = Task { [weak self] in
            struct TagCount: Decodable { let tag: String; let count: Int }
            struct TagCountsResponse: Decodable { let total: Int; let counts: [TagCount] }
            guard let resp: TagCountsResponse = try? await APIClient.get(
                "/stories/tag-counts",
                params: ["city": cityId, "day": day]
            ) else { return }
            guard !Task.isCancelled, let self else { return }
            guard self.selectedCity.id == cityId, self.selectedDayOffset == dayOffset else { return }
            self.tagCounts = Dictionary(resp.counts.map { ($0.tag, $0.count) }, uniquingKeysWith: { _, latest in latest })
        }
    }

    var sortedTags: [TagPill] {
        TagSorting.sorted(tags, counts: tagCounts)
    }

    var restoredViewport: MKCoordinateRegion? {
        let d = UserDefaults.standard
        guard d.object(forKey: MapPrefs.vpLat) != nil else { return nil }
        guard d.string(forKey: MapPrefs.vpCityId) == selectedCity.id else { return nil }
        let span = MKCoordinateSpan(
            latitudeDelta: d.double(forKey: MapPrefs.vpSpanLat),
            longitudeDelta: d.double(forKey: MapPrefs.vpSpanLng)
        )
        guard span.latitudeDelta > 0, span.latitudeDelta <= Self.maxViewportSpan else { return nil }
        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(
                latitude: d.double(forKey: MapPrefs.vpLat),
                longitude: d.double(forKey: MapPrefs.vpLng)
            ),
            span: span
        )
    }

    // Discard wide zoom-outs so relaunches stay on a city.
    private static let maxViewportSpan = 6.0

    var initialRegion: MKCoordinateRegion {
        restoredViewport ?? selectedCity.region
    }

    func saveViewport(_ region: MKCoordinateRegion) {
        guard region.span.latitudeDelta <= Self.maxViewportSpan else { return }
        let d = UserDefaults.standard
        d.set(region.center.latitude, forKey: MapPrefs.vpLat)
        d.set(region.center.longitude, forKey: MapPrefs.vpLng)
        d.set(region.span.latitudeDelta, forKey: MapPrefs.vpSpanLat)
        d.set(region.span.longitudeDelta, forKey: MapPrefs.vpSpanLng)
        d.set(selectedCity.id, forKey: MapPrefs.vpCityId)
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
        // Future day queries use future created_at, so skip client TTL checks.
        let dayBrowse = selectedDayOffset > 0
        return mergedPostsById().values
            .filter { ($0.isRestaurant || dayBrowse || $0.isStillValid) && Self.isMapCategory($0.category) }
            .sorted { $0.id < $1.id }
    }

    private func mergedPostsById() -> [String: Post] {
        var byId: [String: Post] = [:]
        for dict in squares.values {
            byId.merge(dict) { _, latest in latest }
        }
        byId.merge(extraPosts) { _, latest in latest }
        return byId
    }

    private static func isMapCategory(_ category: String?) -> Bool {
        let value = category ?? AppConstants.categoryEvents
        return value == AppConstants.categoryEvents || value == AppConstants.categoryFood
    }

    var maxZoomOutDistance: CLLocationDistance { 100_000 }

    var clusterConfig: ClusterConfig { .local }

    var overlays: [MapOverlay] {
        allPosts.map { .pin(MapPin(post: $0)) }
    }

    func dayString(offset: Int) -> String {
        let date = AppConstants.warsawCalendar.date(byAdding: .day, value: offset, to: Date()) ?? Date()
        return AppConstants.isoDayFormatter.string(from: date)
    }

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

    func reloadCities() {
        selectedCity = CatalogueStore.shared.city(id: selectedCity.id) ?? CatalogueStore.shared.defaultCity
    }

    func selectCity(_ city: City) {
        selectedCity = city
        UserDefaults.standard.set(city.id, forKey: MapPrefs.cityId)
        MapPrefs.viewportKeys.forEach { UserDefaults.standard.removeObject(forKey: $0) }
        clearFeed()
        let box = Self.bbox(for: city.region)
        fetchStories(swLat: box.swLat, swLng: box.swLng, neLat: box.neLat, neLng: box.neLng)
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
        fetchSequence += 1
        let seq = fetchSequence
        removeUserInFlightSquares()
        isRegionFetchPending = true
        debounceTask = Task { [weak self] in
            if debounced {
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
            guard !Task.isCancelled, let self, self.fetchSequence == seq else { return }
            await self.fetchVisibleSquares(refresh: false, trackLoad: true, userSeq: seq)
            if self.fetchSequence == seq {
                self.isRegionFetchPending = false
            }
        }
    }

    @discardableResult
    private func fetchVisibleSquares(refresh: Bool, trackLoad: Bool, userSeq: Int? = nil) async -> [Post] {
        guard !Task.isCancelled, let viewport else {
            await endUserLoadIfNeeded(trackLoad: trackLoad, userSeq: userSeq)
            return []
        }
        let ids = Self.squareIds(in: viewport)
        let visible = Set(ids)
        let token = feedToken
        let targets = missingSquareTargets(ids: ids, token: token, refresh: refresh)
        guard !targets.isEmpty else {
            _ = pruneSquares(keeping: visible)
            await endUserLoadIfNeeded(trackLoad: trackLoad, userSeq: userSeq)
            return []
        }
        let flightID = registerInFlightSquares(targets, token: token, isUser: trackLoad)
        defer { unregisterInFlightSquares(flightID: flightID) }
        if trackLoad { startUserLoad() }
        let results = await fetchSquaresBatch(targets: targets)
        guard !Task.isCancelled, token == feedToken else {
            await endUserLoadIfNeeded(trackLoad: trackLoad, userSeq: userSeq)
            return []
        }
        let fetched = applySquareResults(results, visible: visible)
        if trackLoad { knownPostIds.formUnion(fetched.map(\.id)) }
        await endUserLoadIfNeeded(trackLoad: trackLoad, userSeq: userSeq)
        return fetched
    }

    private func missingSquareTargets(ids: [String], token: String, refresh: Bool) -> [String] {
        ids.filter { id in
            inFlightSquares[Self.flightKey(token: token, id: id)] == nil && (refresh || squares[id] == nil)
        }
    }

    private static func flightKey(token: String, id: String) -> String {
        "\(token)|\(id)"
    }

    private func registerInFlightSquares(_ targets: [String], token: String, isUser: Bool) -> UUID {
        let flightID = UUID()
        let entry = InFlightSquare(flightID: flightID, isUser: isUser)
        for id in targets {
            inFlightSquares[Self.flightKey(token: token, id: id)] = entry
        }
        return flightID
    }

    private func unregisterInFlightSquares(flightID: UUID) {
        inFlightSquares = inFlightSquares.filter { $0.value.flightID != flightID }
    }

    private func removeUserInFlightSquares() {
        inFlightSquares = inFlightSquares.filter { !$0.value.isUser }
    }

    private func fetchSquaresBatch(targets: [String]) async -> [SquareFetchResult] {
        let day = selectedDayOffset > 0 ? dayString(offset: selectedDayOffset) : nil
        let tags = tagFilterParam
        return await withTaskGroup(of: SquareFetchResult?.self) { group in
            for id in targets {
                group.addTask {
                    await Self.fetchSquare(id: id, day: day, tags: tags)
                }
            }
            var collected: [SquareFetchResult] = []
            for await case let result? in group {
                collected.append(result)
            }
            return collected
        }
    }

    private func applySquareResults(_ results: [SquareFetchResult], visible: Set<String>) -> [Post] {
        var fetched: [Post] = []
        for result in results {
            squares[result.id] = Dictionary(result.stories.map { ($0.id, $0) }, uniquingKeysWith: { _, latest in latest })
            fetched.append(contentsOf: result.stories)
        }
        let didPrune = pruneSquares(keeping: visible)
        if !results.isEmpty || didPrune {
            posts = allPosts
        }
        return fetched
    }

    private var feedToken: String {
        "\(feedGeneration)|\(selectedDayOffset)|\(tagFilterParam ?? "all")"
    }

    nonisolated private static func fetchSquare(id: String, day: String?, tags: String?) async -> SquareFetchResult? {
        guard !Task.isCancelled, let box = squareBox(id) else { return nil }
        let params = squareParams(box: box, day: day, tags: tags)
        let resp: PostListResponse
        do {
            resp = try await APIClient.get("/stories", params: params)
        } catch {
            handleSquareError(error)
            return nil
        }
        guard !Task.isCancelled else { return nil }
        return SquareFetchResult(id: id, stories: resp.stories)
    }

    nonisolated private static func squareParams(box: MapBBox, day: String?, tags: String?) -> [String: String] {
        var params = [
            "sw_lat": String(box.swLat),
            "sw_lng": String(box.swLng),
            "ne_lat": String(box.neLat),
            "ne_lng": String(box.neLng),
            "category": AppConstants.categoryEvents,
            "limit": "1000",
        ]
        if let day { params["day"] = day }
        if let tags { params["tags"] = tags }
        return params
    }

    nonisolated private static func handleSquareError(_ error: Error) {
        if error is CancellationError { return }
        if let urlError = error as? URLError, urlError.code == .cancelled { return }
        print("Failed to load stories:", error)
    }

    private func pruneSquares(keeping visible: Set<String>) -> Bool {
        squaresOrder.removeAll { visible.contains($0) }
        squaresOrder.insert(contentsOf: visible, at: 0)
        var didPrune = false
        while squaresOrder.count > Self.maxSquares, let last = squaresOrder.last, !visible.contains(last) {
            squaresOrder.removeLast()
            let removed = squares.removeValue(forKey: last) != nil
            didPrune = didPrune || removed
        }
        return didPrune
    }

    private func clearFeed() {
        feedGeneration += 1
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
        guard la0 <= la1, lo0 <= lo1 else { return [] }
        return (la0...la1).flatMap { la in
            (lo0...lo1).map { lo in "\(la)_\(lo)" }
        }
    }

    nonisolated private static func squareBox(_ id: String) -> MapBBox? {
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

    private var loadingSince: Date?

    private func startUserLoad() {
        loadingSince = Date()
        if !isLoading { isLoading = true }
    }

    private func endUserLoadIfNeeded(trackLoad: Bool, userSeq: Int?) async {
        guard trackLoad else { return }
        await finishUserLoad(userSeq: userSeq)
    }

    // Hold the indicator briefly so fast responses do not flash the spinner.
    private func finishUserLoad(userSeq: Int?) async {
        guard isLoading, userSeq == nil || userSeq == fetchSequence else { return }
        if let since = loadingSince {
            await sleepMinimumIndicator(since: since)
        }
        guard userSeq == nil || userSeq == fetchSequence else { return }
        loadingSince = nil
        isLoading = false
    }

    private func sleepMinimumIndicator(since: Date) async {
        let minS = Double(AppConstants.minLoadingIndicatorMs) / 1000
        let elapsed = Date().timeIntervalSince(since)
        guard elapsed < minS else { return }
        try? await Task.sleep(nanoseconds: UInt64((minS - elapsed) * 1_000_000_000))
    }

    private static let pollInterval: UInt64 = 20_000_000_000

    func startPolling() {
        stopPolling()
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: Self.pollInterval)
                guard !Task.isCancelled, let self else { return }
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
            !knownPostIds.contains($0.id) && $0.user_id != currentUserId
        }
        knownPostIds.formUnion(fetched.map(\.id))
        if hasNew {
            ToastManager.shared.show("Nowe!")
        }
    }

    private func replacePost(_ post: Post) {
        var didUpdate = false
        for (id, dict) in squares where dict[post.id] != nil {
            var next = dict
            next[post.id] = post
            squares[id] = next
            didUpdate = true
        }
        if extraPosts[post.id] != nil {
            extraPosts[post.id] = post
            didUpdate = true
        }
        if didUpdate {
            posts = allPosts
        }
    }

    func markWatched(_ postId: String) async {
        do {
            try await APIClient.postEmpty("/actions/\(postId)/watched")
            applyWatched(postId: postId)
        } catch {
            print("Failed to mark watched:", error)
        }
    }

    private func applyWatched(postId: String) {
        guard let post = posts.first(where: { $0.id == postId }) else { return }
        replacePost(post.with(watched: true))
    }

    func toggleLike(_ postId: String) async -> Bool {
        do {
            struct LikeResp: Codable { let liked: Bool }
            let resp: LikeResp = try await APIClient.postEmptyBody("/actions/\(postId)/like")
            applyLike(postId: postId, liked: resp.liked)
            return resp.liked
        } catch {
            print("Failed to toggle like:", error)
            return false
        }
    }

    private func applyLike(postId: String, liked: Bool) {
        guard let post = posts.first(where: { $0.id == postId }) else { return }
        let count = liked ? post.likes_count + 1 : max(0, post.likes_count - 1)
        replacePost(post.with(liked: liked, likesCount: count))
    }

    func toggleDislike(_ postId: String) async -> Bool {
        do {
            struct DislikeResp: Codable { let disliked: Bool }
            let resp: DislikeResp = try await APIClient.postEmptyBody("/actions/\(postId)/dislike")
            applyDislike(postId: postId, disliked: resp.disliked)
            return resp.disliked
        } catch {
            print("Failed to toggle dislike:", error)
            return false
        }
    }

    private func applyDislike(postId: String, disliked: Bool) {
        guard let post = posts.first(where: { $0.id == postId }) else { return }
        let count = disliked ? post.dislikes_count + 1 : max(0, post.dislikes_count - 1)
        replacePost(post.with(disliked: disliked, dislikesCount: count))
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
        let post: Post
        do {
            post = try await APIClient.get("/posts/\(id)")
        } catch {
            print("Failed to fetch post \(id):", error)
            return nil
        }
        extraPosts[post.id] = post
        posts = allPosts
        return post
    }

}
