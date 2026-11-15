import Foundation

@MainActor
final class LocalEventsListViewModel: ObservableObject {
    @Published private(set) var sections: [LocalDaySection] = []
    @Published private(set) var tagCounts: [String: Int] = [:]
    @Published private(set) var isInitialLoading = false
    @Published private(set) var isLoadingMore = false
    @Published private(set) var hasMore = false
    @Published private(set) var errorMessage: String?

    nonisolated static let restaurantTagId = "restauracje"
    nonisolated static let maxDayOffset = 7

    private static let waveSize = 4
    nonisolated private static let retryDelaysMs = [0, 180, 400]
    private static let loadErrorText = "Coś poszło nie tak, spróbuj ponownie"

    private static let isoDayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = AppConstants.warsawCalendar
        formatter.timeZone = AppConstants.warsawTimeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    nonisolated static func effectiveTagsParam(_ selectedTagsParam: String?, visibleTags: [TagPill]) -> String? {
        guard let selectedTagsParam, !selectedTagsParam.isEmpty else { return nil }
        let remaining = nonRestaurantTagIDs(from: selectedTagsParam)
        if !remaining.isEmpty {
            return remaining.joined(separator: ",")
        }
        let fallback = visibleTags.map(\.id).sorted()
        return fallback.isEmpty ? nil : fallback.joined(separator: ",")
    }

    nonisolated static func effectiveFilterTagIds(_ selectedTagsParam: String?, visibleTags: [TagPill]) -> Set<String>? {
        guard let selectedTagsParam, !selectedTagsParam.isEmpty else { return nil }
        let remaining = Set(nonRestaurantTagIDs(from: selectedTagsParam))
        guard !remaining.isEmpty else { return nil }
        let visibleIds = Set(visibleTags.map(\.id))
        if !visibleIds.isEmpty, remaining == visibleIds {
            return nil
        }
        return remaining
    }

    private var dayCache: [String: [Post]] = [:]
    private var currentCityId: String?
    private var currentStartOffset = 0
    private var currentReferenceDate = Date()
    private var filterTagIds: Set<String>?
    private var generation = 0
    private var activeTask: Task<Void, Never>?

    func loadIfNeeded(
        city: City,
        tags: String?,
        startDayOffset: Int = 0,
        visibleTags: [TagPill] = []
    ) {
        let start = Self.clampedStart(startDayOffset)
        filterTagIds = Self.effectiveFilterTagIds(tags, visibleTags: visibleTags)
        if isSameInFlightScope(cityId: city.id, startOffset: start) {
            rebuildSections()
            return
        }
        if isFullyCachedScope(cityId: city.id, startOffset: start) {
            currentStartOffset = start
            rebuildAll()
            markCompleted()
            return
        }
        startLoad(city: city, startOffset: start, forceRefresh: false)
    }

    func loadInitial(
        city: City,
        tags: String?,
        startDayOffset: Int = 0,
        visibleTags: [TagPill] = []
    ) {
        let start = Self.clampedStart(startDayOffset)
        filterTagIds = Self.effectiveFilterTagIds(tags, visibleTags: visibleTags)
        startLoad(city: city, startOffset: start, forceRefresh: false)
    }

    func syncTags(_ nextFilterTagIds: Set<String>?) {
        guard filterTagIds != nextFilterTagIds else { return }
        filterTagIds = nextFilterTagIds
        rebuildSections()
    }

    func refresh(
        city: City,
        tags: String?,
        startDayOffset: Int = 0,
        visibleTags: [TagPill] = []
    ) async {
        let start = Self.clampedStart(startDayOffset)
        filterTagIds = Self.effectiveFilterTagIds(tags, visibleTags: visibleTags)
        activeTask?.cancel()
        let task = Task<Void, Never> { [weak self] in
            await self?.performLoad(city: city, startOffset: start, forceRefresh: true)
        }
        activeTask = task
        await task.value
    }

    func loadMoreIfNeeded(
        currentSection: LocalDaySection,
        city: City,
        tags: String?,
        startDayOffset: Int = 0
    ) {
        guard hasMore, !isInitialLoading, !isLoadingMore else { return }
        loadMore(city: city, tags: tags, startDayOffset: startDayOffset)
    }

    func loadMore(city: City, tags: String?, startDayOffset: Int = 0) {
        let start = Self.clampedStart(startDayOffset)
        guard currentCityId == city.id,
              currentStartOffset == start,
              hasMore,
              !isInitialLoading,
              !isLoadingMore else { return }
        startLoad(city: city, startOffset: start, forceRefresh: false)
    }

    private func isSameInFlightScope(cityId: String, startOffset: Int) -> Bool {
        currentCityId == cityId && currentStartOffset == startOffset && (isInitialLoading || isLoadingMore)
    }

    private func isFullyCachedScope(cityId: String, startOffset: Int) -> Bool {
        guard currentCityId == cityId, errorMessage == nil else { return false }
        return missingOffsets(cityId: cityId, from: startOffset, referenceDate: currentReferenceDate).isEmpty
    }

    private func startLoad(city: City, startOffset: Int, forceRefresh: Bool) {
        activeTask?.cancel()
        activeTask = Task { [weak self] in
            await self?.performLoad(city: city, startOffset: startOffset, forceRefresh: forceRefresh)
        }
    }

    private func performLoad(city: City, startOffset: Int, forceRefresh: Bool) async {
        generation += 1
        let token = generation
        let referenceDate = Date()
        prepareScope(cityId: city.id, startOffset: startOffset, referenceDate: referenceDate, forceRefresh: forceRefresh)
        let offsets = offsetsToLoad(cityId: city.id, from: startOffset, referenceDate: referenceDate, forceRefresh: forceRefresh)
        guard !offsets.isEmpty else {
            markCompleted()
            return
        }
        await executeWaveLoad(
            offsets: offsets,
            city: city,
            startOffset: startOffset,
            referenceDate: referenceDate,
            token: token
        )
    }

    private func prepareScope(
        cityId: String,
        startOffset: Int,
        referenceDate: Date,
        forceRefresh: Bool
    ) {
        let cityChanged = currentCityId != cityId
        currentCityId = cityId
        currentStartOffset = startOffset
        currentReferenceDate = referenceDate
        errorMessage = nil
        if cityChanged, !hasAnyCachedDay(cityId: cityId, from: startOffset, referenceDate: referenceDate) {
            sections = []
            tagCounts = [:]
            return
        }
        guard !forceRefresh else { return }
        rebuildAll()
    }

    private func executeWaveLoad(
        offsets: [Int],
        city: City,
        startOffset: Int,
        referenceDate: Date,
        token: Int
    ) async {
        let bbox = MapViewModel.cityBBox(for: city)
        let firstWave = Array(offsets.prefix(Self.waveSize))
        let secondWave = Array(offsets.dropFirst(Self.waveSize))
        isInitialLoading = sections.isEmpty
        isLoadingMore = !sections.isEmpty
        hasMore = true
        let firstSucceeded = await loadWave(
            offsets: firstWave,
            cityId: city.id,
            bbox: bbox,
            referenceDate: referenceDate,
            token: token
        )
        guard !Task.isCancelled, token == generation else { return }
        rebuildAll()
        isInitialLoading = false
        guard firstSucceeded > 0 || hasAnyCachedDay(cityId: city.id, from: startOffset, referenceDate: referenceDate) else {
            finishWithError()
            return
        }
        await finishSecondWave(
            secondWave,
            cityId: city.id,
            bbox: bbox,
            referenceDate: referenceDate,
            token: token
        )
    }

    private func finishSecondWave(
        _ secondWave: [Int],
        cityId: String,
        bbox: MapBBox,
        referenceDate: Date,
        token: Int
    ) async {
        guard !secondWave.isEmpty else {
            markCompleted()
            return
        }
        isLoadingMore = true
        _ = await loadWave(
            offsets: secondWave,
            cityId: cityId,
            bbox: bbox,
            referenceDate: referenceDate,
            token: token
        )
        guard !Task.isCancelled, token == generation else { return }
        rebuildAll()
        markCompleted()
    }

    private func markCompleted() {
        errorMessage = nil
        isInitialLoading = false
        isLoadingMore = false
        hasMore = false
    }

    private func finishWithError() {
        isInitialLoading = false
        isLoadingMore = false
        hasMore = false
        errorMessage = Self.loadErrorText
    }

    private func loadWave(
        offsets: [Int],
        cityId: String,
        bbox: MapBBox,
        referenceDate: Date,
        token: Int
    ) async -> Int {
        guard !Task.isCancelled, token == generation else { return 0 }
        let dayPairs = offsets.map { ($0, Self.dayString(offset: $0, from: referenceDate)) }
        let results = await Self.fetchDays(dayPairs: dayPairs, bbox: bbox)
        guard !Task.isCancelled, token == generation else { return 0 }
        return storeDayResults(results, cityId: cityId)
    }

    private func storeDayResults(_ results: [(Int, String, [Post]?)], cityId: String) -> Int {
        var succeeded = 0
        for (_, isoDay, posts) in results {
            succeeded += storeSingleDay(isoDay: isoDay, posts: posts, cityId: cityId)
        }
        return succeeded
    }

    private func storeSingleDay(isoDay: String, posts: [Post]?, cityId: String) -> Int {
        guard let posts else { return 0 }
        dayCache[Self.cacheKey(cityId: cityId, isoDay: isoDay)] = posts
        return 1
    }

    private func rebuildAll() {
        rebuildTagCounts()
        rebuildSections()
    }

    private func rebuildTagCounts() {
        guard let cityId = currentCityId else {
            publishTagCounts([:])
            return
        }
        var counts: [String: Int] = [:]
        for offset in currentStartOffset...Self.maxDayOffset {
            let isoDay = Self.dayString(offset: offset, from: currentReferenceDate)
            let posts = dayCache[Self.cacheKey(cityId: cityId, isoDay: isoDay)] ?? []
            Self.accumulateCounts(&counts, posts: posts)
        }
        publishTagCounts(counts)
    }

    private static func accumulateCounts(_ counts: inout [String: Int], posts: [Post]) {
        for post in posts {
            accumulatePostTags(&counts, tags: post.tags)
        }
    }

    private static func accumulatePostTags(_ counts: inout [String: Int], tags: [String]?) {
        guard let tags else { return }
        for tag in Set(tags) where tag != restaurantTagId {
            counts[tag, default: 0] += 1
        }
    }

    private func publishTagCounts(_ counts: [String: Int]) {
        guard tagCounts != counts else { return }
        tagCounts = counts
    }

    private func rebuildSections() {
        guard let cityId = currentCityId else {
            publishSections([])
            return
        }
        let nextSections = (currentStartOffset...Self.maxDayOffset).compactMap { offset in
            buildSection(cityId: cityId, offset: offset)
        }
        publishSections(nextSections)
    }

    private func buildSection(cityId: String, offset: Int) -> LocalDaySection? {
        let isoDay = Self.dayString(offset: offset, from: currentReferenceDate)
        guard let cachedPosts = dayCache[Self.cacheKey(cityId: cityId, isoDay: isoDay)] else { return nil }
        let filtered = cachedPosts.filter { Self.matchesFilter($0, filterTagIds: filterTagIds) }
        guard !filtered.isEmpty else { return nil }
        let title = EventsDateHeaderFormatter.title(isoDay: isoDay, now: currentReferenceDate)
        return LocalDaySection(dayOffset: offset, isoDay: isoDay, title: title, posts: filtered)
    }

    private func publishSections(_ nextSections: [LocalDaySection]) {
        guard sections != nextSections else { return }
        sections = nextSections
    }

    private func offsetsToLoad(
        cityId: String,
        from startOffset: Int,
        referenceDate: Date,
        forceRefresh: Bool
    ) -> [Int] {
        guard !forceRefresh else { return Array(startOffset...Self.maxDayOffset) }
        return missingOffsets(cityId: cityId, from: startOffset, referenceDate: referenceDate)
    }

    private func missingOffsets(cityId: String, from startOffset: Int, referenceDate: Date) -> [Int] {
        (startOffset...Self.maxDayOffset).filter { offset in
            let isoDay = Self.dayString(offset: offset, from: referenceDate)
            return dayCache[Self.cacheKey(cityId: cityId, isoDay: isoDay)] == nil
        }
    }

    private func hasAnyCachedDay(cityId: String, from startOffset: Int, referenceDate: Date) -> Bool {
        (startOffset...Self.maxDayOffset).contains { offset in
            let isoDay = Self.dayString(offset: offset, from: referenceDate)
            return dayCache[Self.cacheKey(cityId: cityId, isoDay: isoDay)] != nil
        }
    }

    private static func matchesFilter(_ post: Post, filterTagIds: Set<String>?) -> Bool {
        guard let filterTagIds else { return true }
        guard let postTags = post.tags else { return false }
        return postTags.contains { filterTagIds.contains($0) }
    }

    private static func clampedStart(_ startDayOffset: Int) -> Int {
        min(max(0, startDayOffset), maxDayOffset)
    }

    private static func cacheKey(cityId: String, isoDay: String) -> String {
        "\(cityId)|\(isoDay)"
    }

    private static func dayString(offset: Int, from referenceDate: Date) -> String {
        let calendar = AppConstants.warsawCalendar
        let today = calendar.startOfDay(for: referenceDate)
        let target = calendar.date(byAdding: .day, value: offset, to: today) ?? referenceDate
        return isoDayFormatter.string(from: target)
    }

    nonisolated private static func fetchDays(
        dayPairs: [(Int, String)],
        bbox: MapBBox
    ) async -> [(Int, String, [Post]?)] {
        await withTaskGroup(of: (Int, String, [Post]?).self) { group in
            for (offset, isoDay) in dayPairs {
                group.addTask {
                    let posts = await fetchDayWithRetry(isoDay: isoDay, bbox: bbox, attempt: 0)
                    return (offset, isoDay, posts)
                }
            }
            var collected: [(Int, String, [Post]?)] = []
            for await item in group {
                collected.append(item)
            }
            return collected.sorted { $0.0 < $1.0 }
        }
    }

    nonisolated private static func fetchDayWithRetry(
        isoDay: String,
        bbox: MapBBox,
        attempt: Int
    ) async -> [Post]? {
        guard !Task.isCancelled, attempt < retryDelaysMs.count else { return nil }
        let delayMs = retryDelaysMs[attempt]
        if delayMs > 0 {
            try? await Task.sleep(for: .milliseconds(delayMs))
        }
        guard !Task.isCancelled else { return nil }
        do {
            return try await fetchDayOnce(isoDay: isoDay, bbox: bbox)
        } catch {
            guard !isCancellation(error) else { return nil }
            return await fetchDayWithRetry(isoDay: isoDay, bbox: bbox, attempt: attempt + 1)
        }
    }

    nonisolated private static func fetchDayOnce(isoDay: String, bbox: MapBBox) async throws -> [Post] {
        let params = [
            "sw_lat": String(bbox.swLat),
            "sw_lng": String(bbox.swLng),
            "ne_lat": String(bbox.neLat),
            "ne_lng": String(bbox.neLng),
            "category": AppConstants.categoryEvents,
            "day": isoDay,
            "limit": String(AppConstants.apiLimit),
        ]
        let response: PostListResponse = try await APIClient.get("/stories", params: params)
        return ProviderSortRank.sort(deduplicate(response.stories.filter(\.isLocalListEvent)))
    }

    nonisolated private static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        guard let urlError = error as? URLError else { return false }
        return urlError.code == .cancelled
    }

    nonisolated private static func nonRestaurantTagIDs(from rawTags: String) -> [String] {
        rawTags
            .split(separator: ",")
            .map(String.init)
            .filter { !$0.isEmpty && $0 != restaurantTagId }
            .sorted()
    }

    nonisolated private static func deduplicate(_ posts: [Post]) -> [Post] {
        var seen = Set<String>()
        return posts.filter { seen.insert($0.id).inserted }
    }
}
