import Foundation

struct LocalDaySection: Identifiable, Equatable {
    let dayOffset: Int
    let isoDay: String
    let title: String
    let posts: [Post]

    var id: String { isoDay }
}

@MainActor
final class LocalEventsListViewModel: ObservableObject {
    @Published private(set) var sections: [LocalDaySection] = []
    @Published private(set) var isInitialLoading = false
    @Published private(set) var isLoadingMore = false
    @Published private(set) var hasMore = false
    @Published private(set) var errorMessage: String?

    private struct QueryKey: Equatable {
        let cityId: String
        let tags: String?
        let startDayOffset: Int
    }

    private enum ChunkOutcome {
        case loaded(sections: [LocalDaySection], nextOffset: Int, eventCount: Int)
        case cancelled
        case failed
    }

    private struct DayFetchResult: Sendable {
        let offset: Int
        let isoDay: String
        let posts: [Post]
    }

    nonisolated static let restaurantTagId = "restauracje"

    private static let maxDayOffset = 30
    private static let chunkSize = 3
    private static let initialTargetEvents = 12
    private static let loadErrorText = "Coś poszło nie tak, spróbuj ponownie"

    nonisolated static func effectiveTagsParam(_ selectedTagsParam: String?, visibleTags: [TagPill]) -> String? {
        guard let selectedTagsParam, !selectedTagsParam.isEmpty else { return nil }
        let remaining = nonRestaurantTagIDs(from: selectedTagsParam)
        if !remaining.isEmpty {
            return remaining.joined(separator: ",")
        }
        let fallback = visibleTags.map(\.id).sorted()
        return fallback.isEmpty ? nil : fallback.joined(separator: ",")
    }

    private static let isoDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = AppConstants.warsawCalendar
        f.timeZone = AppConstants.warsawTimeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private var generation = 0
    private var nextDayOffset = 0
    private var loadedKey: QueryKey?
    private var activeTask: Task<Void, Never>?

    func loadIfNeeded(city: City, tags: String?, startDayOffset: Int = 0) {
        let start = Self.clampedStart(startDayOffset)
        let key = QueryKey(cityId: city.id, tags: tags, startDayOffset: start)
        guard loadedKey != key || errorMessage != nil else { return }
        loadInitial(city: city, tags: tags, startDayOffset: start)
    }

    func loadInitial(city: City, tags: String?, startDayOffset: Int = 0) {
        let start = Self.clampedStart(startDayOffset)
        activeTask?.cancel()
        generation += 1
        let token = generation
        loadedKey = QueryKey(cityId: city.id, tags: tags, startDayOffset: start)
        sections = []
        nextDayOffset = start
        hasMore = true
        errorMessage = nil
        isLoadingMore = false
        isInitialLoading = true
        activeTask = Task { [weak self] in
            await self?.runInitialLoad(
                city: city,
                tags: tags,
                startDayOffset: start,
                token: token,
                replaceOnComplete: false
            )
        }
    }

    func refresh(city: City, tags: String?, startDayOffset: Int = 0) async {
        let start = Self.clampedStart(startDayOffset)
        activeTask?.cancel()
        generation += 1
        let token = generation
        loadedKey = QueryKey(cityId: city.id, tags: tags, startDayOffset: start)
        errorMessage = nil
        isLoadingMore = false
        isInitialLoading = sections.isEmpty
        let task = Task<Void, Never> { [weak self] in
            await self?.runInitialLoad(
                city: city,
                tags: tags,
                startDayOffset: start,
                token: token,
                replaceOnComplete: true
            )
        }
        activeTask = task
        await task.value
    }

    func loadMoreIfNeeded(currentSection: LocalDaySection, city: City, tags: String?, startDayOffset: Int = 0) {
        guard shouldLoadMore(for: currentSection) else { return }
        loadMore(city: city, tags: tags, startDayOffset: startDayOffset)
    }

    func loadMore(city: City, tags: String?, startDayOffset: Int = 0) {
        let start = Self.clampedStart(startDayOffset)
        let key = QueryKey(cityId: city.id, tags: tags, startDayOffset: start)
        guard loadedKey == key else { return }
        guard !isInitialLoading, !isLoadingMore, hasMore else { return }
        guard nextDayOffset <= Self.maxDayOffset else {
            hasMore = false
            return
        }
        let token = generation
        isLoadingMore = true
        activeTask = Task { [weak self] in
            await self?.runLoadMore(city: city, tags: tags, token: token)
        }
    }

    private func shouldLoadMore(for section: LocalDaySection) -> Bool {
        guard let index = sections.firstIndex(where: { $0.id == section.id }) else { return false }
        return index >= max(0, sections.count - 2)
    }

    private static func clampedStart(_ startDayOffset: Int) -> Int {
        min(max(0, startDayOffset), maxDayOffset)
    }

    private func runInitialLoad(
        city: City,
        tags: String?,
        startDayOffset: Int,
        token: Int,
        replaceOnComplete: Bool
    ) async {
        let now = Date()
        let bbox = MapViewModel.cityBBox(for: city)
        await loadInitialChunk(
            cursor: startDayOffset,
            collected: [],
            totalEvents: 0,
            bbox: bbox,
            tags: tags,
            referenceDate: now,
            token: token,
            replaceOnComplete: replaceOnComplete
        )
    }

    private func loadInitialChunk(
        cursor: Int,
        collected: [LocalDaySection],
        totalEvents: Int,
        bbox: MapBBox,
        tags: String?,
        referenceDate: Date,
        token: Int,
        replaceOnComplete: Bool
    ) async {
        guard !Task.isCancelled, token == generation else { return }
        guard cursor <= Self.maxDayOffset, totalEvents < Self.initialTargetEvents else {
            finishInitialSuccess(collected: collected, cursor: cursor, token: token)
            return
        }
        let outcome = await loadChunk(startOffset: cursor, bbox: bbox, tags: tags, referenceDate: referenceDate)
        guard !Task.isCancelled, token == generation else { return }
        guard case let .loaded(chunkSections, nextOffset, eventCount) = outcome else {
            finishInitialFailure(outcome: outcome, collected: collected, cursor: cursor, token: token)
            return
        }
        let nextCollected = collected + chunkSections
        let nextTotal = totalEvents + eventCount
        publishInitialProgress(
            collected: nextCollected,
            cursor: nextOffset,
            totalEvents: nextTotal,
            replaceOnComplete: replaceOnComplete
        )
        await loadInitialChunk(
            cursor: nextOffset,
            collected: nextCollected,
            totalEvents: nextTotal,
            bbox: bbox,
            tags: tags,
            referenceDate: referenceDate,
            token: token,
            replaceOnComplete: replaceOnComplete
        )
    }

    private func publishInitialProgress(
        collected: [LocalDaySection],
        cursor: Int,
        totalEvents: Int,
        replaceOnComplete: Bool
    ) {
        guard !replaceOnComplete, !collected.isEmpty else { return }
        sections = collected
        nextDayOffset = cursor
        hasMore = cursor <= Self.maxDayOffset
        isInitialLoading = false
        isLoadingMore = hasMore && totalEvents < Self.initialTargetEvents
    }

    private func finishInitialSuccess(collected: [LocalDaySection], cursor: Int, token: Int) {
        guard token == generation else { return }
        sections = collected
        nextDayOffset = cursor
        hasMore = cursor <= Self.maxDayOffset
        isInitialLoading = false
        isLoadingMore = false
    }

    private func finishInitialFailure(outcome: ChunkOutcome, collected: [LocalDaySection], cursor: Int, token: Int) {
        guard token == generation else { return }
        isInitialLoading = false
        isLoadingMore = false
        if case .cancelled = outcome { return }
        if collected.isEmpty, sections.isEmpty {
            errorMessage = Self.loadErrorText
            hasMore = false
            return
        }
        guard !collected.isEmpty else { return }
        sections = collected
        nextDayOffset = cursor
        hasMore = cursor <= Self.maxDayOffset
    }

    private func runLoadMore(city: City, tags: String?, token: Int) async {
        let now = Date()
        let bbox = MapViewModel.cityBBox(for: city)
        await loadMoreStep(cursor: nextDayOffset, bbox: bbox, tags: tags, referenceDate: now, token: token)
    }

    private func loadMoreStep(
        cursor: Int,
        bbox: MapBBox,
        tags: String?,
        referenceDate: Date,
        token: Int
    ) async {
        guard !Task.isCancelled, token == generation else { return }
        guard cursor <= Self.maxDayOffset else {
            applyLoadMore(found: [], cursor: cursor, token: token)
            return
        }
        let outcome = await loadChunk(startOffset: cursor, bbox: bbox, tags: tags, referenceDate: referenceDate)
        guard !Task.isCancelled, token == generation else { return }
        guard case let .loaded(chunkSections, nextOffset, _) = outcome else {
            finishLoadMoreFailure(cursor: cursor, token: token)
            return
        }
        guard chunkSections.isEmpty else {
            applyLoadMore(found: chunkSections, cursor: nextOffset, token: token)
            return
        }
        await loadMoreStep(cursor: nextOffset, bbox: bbox, tags: tags, referenceDate: referenceDate, token: token)
    }

    private func applyLoadMore(found: [LocalDaySection], cursor: Int, token: Int) {
        guard token == generation else { return }
        nextDayOffset = cursor
        hasMore = cursor <= Self.maxDayOffset
        isLoadingMore = false
        guard !found.isEmpty else { return }
        let existingDays = Set(sections.map(\.isoDay))
        let newSections = found.filter { !existingDays.contains($0.isoDay) }
        sections.append(contentsOf: newSections)
    }

    private func finishLoadMoreFailure(cursor: Int, token: Int) {
        guard token == generation else { return }
        nextDayOffset = cursor
        hasMore = cursor <= Self.maxDayOffset
        isLoadingMore = false
    }

    private func loadChunk(
        startOffset: Int,
        bbox: MapBBox,
        tags: String?,
        referenceDate: Date
    ) async -> ChunkOutcome {
        let endOffset = min(startOffset + Self.chunkSize - 1, Self.maxDayOffset)
        let dayPairs = (startOffset...endOffset).map { offset in
            (offset, Self.dayString(offset: offset, from: referenceDate))
        }
        do {
            let rawDays = try await Self.fetchDays(dayPairs: dayPairs, bbox: bbox, tags: tags)
            let chunkSections = Self.makeSections(from: rawDays, referenceDate: referenceDate)
            let eventCount = chunkSections.reduce(0) { $0 + $1.posts.count }
            return .loaded(sections: chunkSections, nextOffset: endOffset + 1, eventCount: eventCount)
        } catch is CancellationError {
            return .cancelled
        } catch let error as URLError where error.code == .cancelled {
            return .cancelled
        } catch {
            return .failed
        }
    }

    private static func makeSections(from rawDays: [DayFetchResult], referenceDate: Date) -> [LocalDaySection] {
        rawDays.compactMap { makeSection(from: $0, referenceDate: referenceDate) }
    }

    private static func makeSection(from result: DayFetchResult, referenceDate: Date) -> LocalDaySection? {
        guard !result.posts.isEmpty else { return nil }
        let title = EventsDateHeaderFormatter.title(isoDay: result.isoDay, now: referenceDate)
        return LocalDaySection(
            dayOffset: result.offset,
            isoDay: result.isoDay,
            title: title,
            posts: result.posts
        )
    }

    private static func dayString(offset: Int, from referenceDate: Date) -> String {
        let calendar = AppConstants.warsawCalendar
        let today = calendar.startOfDay(for: referenceDate)
        let target = calendar.date(byAdding: .day, value: offset, to: today) ?? referenceDate
        return isoDayFormatter.string(from: target)
    }

    nonisolated private static func fetchDays(
        dayPairs: [(Int, String)],
        bbox: MapBBox,
        tags: String?
    ) async throws -> [DayFetchResult] {
        let fetched = try await withThrowingTaskGroup(of: DayFetchResult.self) { group in
            for (offset, isoDay) in dayPairs {
                group.addTask {
                    let posts = try await fetchDay(isoDay: isoDay, bbox: bbox, tags: tags)
                    return DayFetchResult(offset: offset, isoDay: isoDay, posts: posts)
                }
            }
            var results: [DayFetchResult] = []
            for try await dayResult in group {
                results.append(dayResult)
            }
            return results
        }
        return fetched.sorted { $0.offset < $1.offset }
    }

    nonisolated private static func fetchDay(isoDay: String, bbox: MapBBox, tags: String?) async throws -> [Post] {
        var params = [
            "sw_lat": String(bbox.swLat),
            "sw_lng": String(bbox.swLng),
            "ne_lat": String(bbox.neLat),
            "ne_lng": String(bbox.neLng),
            "category": AppConstants.categoryEvents,
            "day": isoDay,
            "limit": String(AppConstants.apiLimit),
        ]
        if let sanitized = sanitizedQueryTags(tags) {
            params["tags"] = sanitized
        }
        let response: PostListResponse = try await APIClient.get("/stories", params: params)
        return ProviderSortRank.sort(deduplicate(response.stories.filter(\.isLocalListEvent)))
    }

    nonisolated private static func sanitizedQueryTags(_ rawTags: String?) -> String? {
        guard let rawTags, !rawTags.isEmpty else { return nil }
        let filtered = nonRestaurantTagIDs(from: rawTags)
        return filtered.isEmpty ? nil : filtered.joined(separator: ",")
    }

    nonisolated private static func nonRestaurantTagIDs(from rawTags: String) -> [String] {
        rawTags
            .split(separator: ",")
            .map(String.init)
            .filter { !$0.isEmpty && $0 != restaurantTagId }
    }

    nonisolated private static func deduplicate(_ posts: [Post]) -> [Post] {
        var seen = Set<String>()
        return posts.filter { seen.insert($0.id).inserted }
    }
}
