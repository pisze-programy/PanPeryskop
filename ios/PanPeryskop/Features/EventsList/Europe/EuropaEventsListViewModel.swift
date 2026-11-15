import Foundation

struct EuropaDaySection: Identifiable, Equatable {
    let dayOffset: Int
    let isoDay: String
    let title: String
    let events: [TravelEvent]

    var id: String { isoDay }
}

@MainActor
final class EuropaEventsListViewModel: ObservableObject {
    @Published private(set) var sections: [EuropaDaySection] = []
    @Published private(set) var isInitialLoading = false
    @Published private(set) var isLoadingMore = false
    @Published private(set) var hasMore = true
    @Published private(set) var hasFailed = false

    private struct LoadedDay {
        let dayOffset: Int
        let isoDay: String
        let events: [TravelEvent]
    }

    private static let batchSize = 5
    private static let initialTargetEvents = 12
    private static let eventTagIds = [
        TripsViewModel.TravelTag.football.rawValue,
        TripsViewModel.TravelTag.runs.rawValue,
    ]

    private weak var tripsViewModel: TripsViewModel?
    private var loadedDays: [LoadedDay] = []
    private var nextOffset = 0
    private var loadedCityId: String?
    private var loadedStartOffset = 0
    private var selectedEventTagIds: Set<String> = Set(eventTagIds)
    private var generation = 0
    private var moreTask: Task<Void, Never>?

    init(tripsViewModel: TripsViewModel? = nil) {
        self.tripsViewModel = tripsViewModel
    }

    func loadIfNeeded(using tripsViewModel: TripsViewModel) async {
        self.tripsViewModel = tripsViewModel
        let nextTags = Self.selectedEventTags(from: tripsViewModel)
        if nextTags != selectedEventTagIds {
            selectedEventTagIds = nextTags
            rebuildSections()
        }
        let startOffset = Self.clampedStartOffset(from: tripsViewModel)
        if loadedCityId != tripsViewModel.selectedCity.id || loadedStartOffset != startOffset {
            await reload(using: tripsViewModel)
            return
        }
        guard !selectedEventTagIds.isEmpty, !isInitialLoading, !isLoadingMore else { return }
        if loadedDays.isEmpty {
            await reload(using: tripsViewModel)
            return
        }
        guard matchingEventCount < Self.initialTargetEvents, hasMore, !hasFailed else { return }
        await resumeInitialFill(using: tripsViewModel)
    }

    func reload(using tripsViewModel: TripsViewModel) async {
        self.tripsViewModel = tripsViewModel
        moreTask?.cancel()
        generation += 1
        let currentGeneration = generation
        resetState(
            cityId: tripsViewModel.selectedCity.id,
            startOffset: Self.clampedStartOffset(from: tripsViewModel),
            tags: Self.selectedEventTags(from: tripsViewModel)
        )
        guard !selectedEventTagIds.isEmpty else { return }
        isInitialLoading = true
        defer { finishInitialLoad(generation: currentGeneration) }
        await runFillLoop(generation: currentGeneration, targetCount: Self.initialTargetEvents, using: tripsViewModel)
    }

    func refresh(using tripsViewModel: TripsViewModel) async {
        async let citiesRefresh: Void = tripsViewModel.refreshCities()
        async let eventsRefresh: Void = reload(using: tripsViewModel)
        _ = await (citiesRefresh, eventsRefresh)
    }

    func syncTags(using tripsViewModel: TripsViewModel) {
        self.tripsViewModel = tripsViewModel
        let nextTags = Self.selectedEventTags(from: tripsViewModel)
        guard nextTags != selectedEventTagIds else { return }
        selectedEventTagIds = nextTags
        rebuildSections()
        guard !selectedEventTagIds.isEmpty,
              matchingEventCount < Self.initialTargetEvents,
              hasMore,
              !hasFailed,
              !isInitialLoading,
              !isLoadingMore else { return }
        loadMoreIfNeeded()
    }

    func loadMoreIfNeeded(using tripsViewModel: TripsViewModel) {
        self.tripsViewModel = tripsViewModel
        loadMoreIfNeeded()
    }

    func loadMoreIfNeeded() {
        guard let tripsViewModel,
              hasMore,
              !hasFailed,
              !isInitialLoading,
              !isLoadingMore,
              !selectedEventTagIds.isEmpty else { return }
        startMoreTask(using: tripsViewModel)
    }

    func retry(using tripsViewModel: TripsViewModel) {
        self.tripsViewModel = tripsViewModel
        hasFailed = false
        guard !sections.isEmpty else {
            moreTask?.cancel()
            moreTask = Task { [weak self] in
                await self?.reload(using: tripsViewModel)
            }
            return
        }
        startMoreTask(using: tripsViewModel)
    }

    private func startMoreTask(using tripsViewModel: TripsViewModel) {
        moreTask?.cancel()
        isLoadingMore = true
        let currentGeneration = generation
        moreTask = Task { [weak self] in
            await self?.runMoreLoad(generation: currentGeneration, using: tripsViewModel)
        }
    }

    private func runMoreLoad(generation currentGeneration: Int, using tripsViewModel: TripsViewModel) async {
        defer { finishMoreLoad(generation: currentGeneration) }
        let target = matchingEventCount < Self.initialTargetEvents ? Self.initialTargetEvents : matchingEventCount + 1
        await runFillLoop(generation: currentGeneration, targetCount: target, using: tripsViewModel)
    }

    private func resumeInitialFill(using tripsViewModel: TripsViewModel) async {
        let currentGeneration = generation
        isInitialLoading = true
        defer { finishInitialLoad(generation: currentGeneration) }
        await runFillLoop(generation: currentGeneration, targetCount: Self.initialTargetEvents, using: tripsViewModel)
    }

    private func resetState(cityId: String, startOffset: Int, tags: Set<String>) {
        loadedCityId = cityId
        loadedStartOffset = startOffset
        selectedEventTagIds = tags
        loadedDays = []
        sections = []
        nextOffset = startOffset
        hasMore = true
        hasFailed = false
        isInitialLoading = false
        isLoadingMore = false
    }

    private static func clampedStartOffset(from tripsViewModel: TripsViewModel) -> Int {
        let maxOffset = max(0, AppConstants.travelHorizonDays - 1)
        return min(max(0, tripsViewModel.selectedDayOffset), maxOffset)
    }

    private func finishInitialLoad(generation currentGeneration: Int) {
        guard generation == currentGeneration else { return }
        isInitialLoading = false
    }

    private func finishMoreLoad(generation currentGeneration: Int) {
        guard generation == currentGeneration else { return }
        isLoadingMore = false
    }

    private func runFillLoop(generation currentGeneration: Int, targetCount: Int, using tripsViewModel: TripsViewModel) async {
        guard generation == currentGeneration,
              !Task.isCancelled,
              !selectedEventTagIds.isEmpty,
              hasMore,
              matchingEventCount < targetCount else { return }
        let succeeded = await loadSingleBatch(generation: currentGeneration, using: tripsViewModel)
        guard succeeded else { return }
        await runFillLoop(generation: currentGeneration, targetCount: targetCount, using: tripsViewModel)
    }

    private func loadSingleBatch(generation currentGeneration: Int, using tripsViewModel: TripsViewModel) async -> Bool {
        let horizon = AppConstants.travelHorizonDays
        guard nextOffset < horizon else {
            hasMore = false
            return false
        }
        let endOffset = min(nextOffset + Self.batchSize, horizon)
        let offsets = Array(nextOffset..<endOffset)
        let results = await fetchBatch(offsets: offsets, using: tripsViewModel)
        guard generation == currentGeneration, !Task.isCancelled else { return false }
        return applyBatchResults(results, nextOffset: endOffset, horizon: horizon, using: tripsViewModel)
    }

    private func fetchBatch(offsets: [Int], using tripsViewModel: TripsViewModel) async -> [(Int, [TravelEvent]?)] {
        await withTaskGroup(of: (Int, [TravelEvent]?).self) { group in
            for offset in offsets {
                group.addTask {
                    let events = await tripsViewModel.fetchConfirmedDayEvents(offset: offset)
                    return (offset, events)
                }
            }
            var collected: [(Int, [TravelEvent]?)] = []
            for await item in group {
                collected.append(item)
            }
            return collected.sorted { $0.0 < $1.0 }
        }
    }

    private func applyBatchResults(
        _ results: [(Int, [TravelEvent]?)],
        nextOffset endOffset: Int,
        horizon: Int,
        using tripsViewModel: TripsViewModel
    ) -> Bool {
        let validDays = results.compactMap { makeLoadedDay(offset: $0.0, events: $0.1, using: tripsViewModel) }
        guard !validDays.isEmpty else {
            hasFailed = true
            return false
        }
        hasFailed = false
        mergeLoadedDays(validDays)
        nextOffset = endOffset
        hasMore = endOffset < horizon
        rebuildSections()
        return true
    }

    private func makeLoadedDay(offset: Int, events: [TravelEvent]?, using tripsViewModel: TripsViewModel) -> LoadedDay? {
        guard let events else { return nil }
        return LoadedDay(dayOffset: offset, isoDay: tripsViewModel.dayIso(offset: offset), events: events)
    }

    private func mergeLoadedDays(_ incoming: [LoadedDay]) {
        var byOffset = Dictionary(uniqueKeysWithValues: loadedDays.map { ($0.dayOffset, $0) })
        for day in incoming {
            byOffset[day.dayOffset] = day
        }
        loadedDays = byOffset.values.sorted { $0.dayOffset < $1.dayOffset }
    }

    private func rebuildSections() {
        guard !selectedEventTagIds.isEmpty else {
            sections = []
            return
        }
        sections = loadedDays.compactMap { daySection(from: $0) }
    }

    private func daySection(from day: LoadedDay) -> EuropaDaySection? {
        let filtered = day.events.filter { selectedEventTagIds.contains($0.tag) }
        guard !filtered.isEmpty else { return nil }
        return EuropaDaySection(
            dayOffset: day.dayOffset,
            isoDay: day.isoDay,
            title: EventsDateHeaderFormatter.title(isoDay: day.isoDay),
            events: filtered
        )
    }

    private var matchingEventCount: Int {
        sections.reduce(0) { $0 + $1.events.count }
    }

    static func selectedEventTags(from tripsViewModel: TripsViewModel) -> Set<String> {
        let explicit = Set(eventTagIds.filter { tripsViewModel.isTagSelected($0) })
        return explicit.isEmpty ? Set(eventTagIds) : explicit
    }
}
