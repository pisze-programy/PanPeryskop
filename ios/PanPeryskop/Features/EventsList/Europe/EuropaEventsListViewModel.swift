import Foundation

@MainActor
final class EuropaEventsListViewModel: ObservableObject {
    @Published private(set) var sections: [EuropaDaySection] = []
    @Published private(set) var tagCounts: [String: Int] = [:]
    @Published private(set) var isInitialLoading = false
    @Published private(set) var isLoadingMore = false
    @Published private(set) var hasMore = false
    @Published private(set) var hasFailed = false

    private static let rangeDays = 7
    private static let firstWaveWindows = 3
    private static let secondWaveWindows = 5
    private static let eventTagIds = [
        TripsViewModel.TravelTag.football.rawValue,
        TripsViewModel.TravelTag.runs.rawValue,
    ]

    private weak var tripsViewModel: TripsViewModel?
    private var eventsByOffset: [Int: [TravelEvent]] = [:]
    private var loadedOriginKey: String?
    private var currentStartOffset = 0
    private var currentLanguage = "pl"
    private var selectedEventTagIds: Set<String> = Set(eventTagIds)
    private var generation = 0
    private var loadTask: Task<Void, Never>?

    init(tripsViewModel: TripsViewModel? = nil) {
        self.tripsViewModel = tripsViewModel
    }

    func loadIfNeeded(using tripsViewModel: TripsViewModel, language: String = "pl") async {
        self.tripsViewModel = tripsViewModel
        let originKey = Self.originKey(from: tripsViewModel)
        let startOffset = Self.clampedStartOffset(from: tripsViewModel)
        let nextTags = Self.selectedEventTags(from: tripsViewModel)
        resetCacheIfOriginChanged(originKey)
        currentStartOffset = startOffset
        currentLanguage = language
        selectedEventTagIds = nextTags
        rebuildAll(using: tripsViewModel)
        let windows = missingWindows(from: startOffset)
        guard !windows.isEmpty else {
            markFullyLoaded()
            return
        }
        await loadWindows(windows, using: tripsViewModel)
    }

    func reload(using tripsViewModel: TripsViewModel, language: String = "pl") async {
        self.tripsViewModel = tripsViewModel
        loadTask?.cancel()
        loadedOriginKey = Self.originKey(from: tripsViewModel)
        currentStartOffset = Self.clampedStartOffset(from: tripsViewModel)
        currentLanguage = language
        selectedEventTagIds = Self.selectedEventTags(from: tripsViewModel)
        eventsByOffset.removeAll()
        sections = []
        tagCounts = Self.zeroTagCounts()
        hasFailed = false
        let windows = missingWindows(from: currentStartOffset)
        await loadWindows(windows, using: tripsViewModel)
    }

    func refresh(using tripsViewModel: TripsViewModel, language: String = "pl") async {
        self.tripsViewModel = tripsViewModel
        loadTask?.cancel()
        tripsViewModel.clearEventsCache()
        async let citiesRefresh: Void = tripsViewModel.refreshCities()
        async let eventsRefresh: Void = refreshEventsPreservingScreen(using: tripsViewModel, language: language)
        _ = await (citiesRefresh, eventsRefresh)
    }

    func syncTags(using tripsViewModel: TripsViewModel, language: String = "pl") {
        self.tripsViewModel = tripsViewModel
        let nextTags = Self.selectedEventTags(from: tripsViewModel)
        guard nextTags != selectedEventTagIds || language != currentLanguage else { return }
        selectedEventTagIds = nextTags
        currentLanguage = language
        rebuildSections(using: tripsViewModel)
    }

    func loadMoreIfNeeded(using tripsViewModel: TripsViewModel, language: String = "pl") {
        self.tripsViewModel = tripsViewModel
        currentLanguage = language
        loadMoreIfNeeded()
    }

    func loadMoreIfNeeded() {
        guard let tripsViewModel,
              hasMore,
              !hasFailed,
              !isInitialLoading,
              !isLoadingMore else { return }
        startBackgroundMissingLoad(using: tripsViewModel)
    }

    func retry(using tripsViewModel: TripsViewModel, language: String = "pl") {
        self.tripsViewModel = tripsViewModel
        currentLanguage = language
        hasFailed = false
        startBackgroundMissingLoad(using: tripsViewModel)
    }

    private func startBackgroundMissingLoad(using tripsViewModel: TripsViewModel) {
        let windows = missingWindows(from: currentStartOffset)
        guard !windows.isEmpty else {
            markFullyLoaded()
            return
        }
        loadTask?.cancel()
        loadTask = Task { [weak self] in
            await self?.loadWindows(windows, using: tripsViewModel)
        }
    }

    private func refreshEventsPreservingScreen(using tripsViewModel: TripsViewModel, language: String) async {
        loadedOriginKey = Self.originKey(from: tripsViewModel)
        currentStartOffset = Self.clampedStartOffset(from: tripsViewModel)
        currentLanguage = language
        selectedEventTagIds = Self.selectedEventTags(from: tripsViewModel)
        eventsByOffset.removeAll()
        hasFailed = false
        let windows = missingWindows(from: currentStartOffset)
        await loadWindows(windows, using: tripsViewModel)
    }

    private func resetCacheIfOriginChanged(_ originKey: String) {
        guard loadedOriginKey != originKey else { return }
        loadTask?.cancel()
        generation += 1
        loadedOriginKey = originKey
        eventsByOffset.removeAll()
        sections = []
        tagCounts = Self.zeroTagCounts()
        hasFailed = false
        hasMore = false
        isInitialLoading = false
        isLoadingMore = false
    }

    private func markFullyLoaded() {
        hasMore = false
        hasFailed = false
        isInitialLoading = false
        isLoadingMore = false
    }

    private func loadWindows(_ windows: [(Int, Int)], using tripsViewModel: TripsViewModel) async {
        generation += 1
        let currentGeneration = generation
        let waves = Self.waveSlices(from: windows)
        guard let firstWave = waves.first else {
            markFullyLoaded()
            return
        }
        hasFailed = false
        hasMore = true
        isInitialLoading = sections.isEmpty
        isLoadingMore = !sections.isEmpty
        let firstWaveCount = await loadWave(firstWave, generation: currentGeneration, using: tripsViewModel)
        guard generation == currentGeneration, !Task.isCancelled else { return }
        rebuildAll(using: tripsViewModel)
        isInitialLoading = false
        guard firstWaveCount > 0 || hasAnyCachedOffset(from: currentStartOffset) else {
            finishWithFailure()
            return
        }
        let remainingWaves = Array(waves.dropFirst())
        await finishRemainingWaves(
            remainingWaves,
            firstWaveAllSucceeded: firstWaveCount == firstWave.count,
            generation: currentGeneration,
            using: tripsViewModel
        )
    }

    private func finishRemainingWaves(
        _ remainingWaves: [[(Int, Int)]],
        firstWaveAllSucceeded: Bool,
        generation currentGeneration: Int,
        using tripsViewModel: TripsViewModel
    ) async {
        guard !remainingWaves.isEmpty else {
            applyFinalWaveState(allSucceeded: firstWaveAllSucceeded)
            return
        }
        isLoadingMore = true
        let remainingAllSucceeded = await loadWaveSequence(
            remainingWaves,
            generation: currentGeneration,
            using: tripsViewModel
        )
        guard generation == currentGeneration, !Task.isCancelled else { return }
        rebuildAll(using: tripsViewModel)
        applyFinalWaveState(allSucceeded: firstWaveAllSucceeded && remainingAllSucceeded)
    }

    private func applyFinalWaveState(allSucceeded: Bool) {
        isLoadingMore = false
        let missing = !missingWindows(from: currentStartOffset).isEmpty
        hasMore = false
        hasFailed = !allSucceeded && missing
    }

    private func finishWithFailure() {
        isInitialLoading = false
        isLoadingMore = false
        hasMore = false
        hasFailed = true
    }

    private func loadWaveSequence(
        _ waves: [[(Int, Int)]],
        generation currentGeneration: Int,
        using tripsViewModel: TripsViewModel
    ) async -> Bool {
        var allSucceeded = true
        for wave in waves {
            let succeededCount = await loadWave(wave, generation: currentGeneration, using: tripsViewModel)
            allSucceeded = allSucceeded && (succeededCount == wave.count)
        }
        return allSucceeded
    }

    private func loadWave(
        _ wave: [(Int, Int)],
        generation currentGeneration: Int,
        using tripsViewModel: TripsViewModel
    ) async -> Int {
        guard generation == currentGeneration, !Task.isCancelled else { return 0 }
        let results = await fetchWindows(wave, using: tripsViewModel)
        guard generation == currentGeneration, !Task.isCancelled else { return 0 }
        return storeWaveResults(results, using: tripsViewModel)
    }

    private func fetchWindows(
        _ windows: [(Int, Int)],
        using tripsViewModel: TripsViewModel
    ) async -> [((Int, Int), [TravelEvent]?)] {
        await withTaskGroup(of: ((Int, Int), [TravelEvent]?).self) { group in
            for window in windows {
                group.addTask {
                    let events = await tripsViewModel.fetchConfirmedRangeEvents(
                        startOffset: window.0,
                        endOffset: window.1
                    )
                    return (window, events)
                }
            }
            var collected: [((Int, Int), [TravelEvent]?)] = []
            for await item in group {
                collected.append(item)
            }
            return collected
        }
    }

    private func storeWaveResults(
        _ results: [((Int, Int), [TravelEvent]?)],
        using tripsViewModel: TripsViewModel
    ) -> Int {
        var succeeded = 0
        for (window, events) in results {
            succeeded += storeSingleWindow(window: window, events: events, using: tripsViewModel)
        }
        return succeeded
    }

    private func storeSingleWindow(
        window: (Int, Int),
        events: [TravelEvent]?,
        using tripsViewModel: TripsViewModel
    ) -> Int {
        guard let events else { return 0 }
        let grouped = Dictionary(grouping: events, by: Self.warsawIsoDay)
        for offset in window.0...window.1 {
            let iso = tripsViewModel.dayIso(offset: offset)
            eventsByOffset[offset] = grouped[iso] ?? []
        }
        return 1
    }

    private func rebuildAll(using tripsViewModel: TripsViewModel) {
        rebuildTagCounts()
        rebuildSections(using: tripsViewModel)
    }

    private func rebuildTagCounts() {
        var counts = Self.zeroTagCounts()
        let horizon = AppConstants.travelHorizonDays
        guard currentStartOffset < horizon else {
            publishTagCounts(counts)
            return
        }
        for offset in currentStartOffset..<horizon {
            accumulateTagCounts(&counts, events: eventsByOffset[offset] ?? [])
        }
        publishTagCounts(counts)
    }

    private func accumulateTagCounts(_ counts: inout [String: Int], events: [TravelEvent]) {
        for event in events {
            counts[event.tag, default: 0] += 1
        }
    }

    private func publishTagCounts(_ counts: [String: Int]) {
        guard tagCounts != counts else { return }
        tagCounts = counts
    }

    private func rebuildSections(using tripsViewModel: TripsViewModel) {
        let horizon = AppConstants.travelHorizonDays
        guard !selectedEventTagIds.isEmpty, currentStartOffset < horizon else {
            publishSections([])
            return
        }
        let filteredDays = (currentStartOffset..<horizon).compactMap { offset in
            filteredDayTuple(offset: offset, using: tripsViewModel)
        }
        let lastIsoDay = filteredDays.last?.1
        let nextSections = filteredDays.map { day in
            buildDaySection(
                offset: day.0,
                isoDay: day.1,
                events: day.2,
                isLastSection: day.1 == lastIsoDay
            )
        }
        publishSections(nextSections)
    }

    private func filteredDayTuple(
        offset: Int,
        using tripsViewModel: TripsViewModel
    ) -> (Int, String, [TravelEvent])? {
        guard let dayEvents = eventsByOffset[offset] else { return nil }
        let matching = dayEvents.filter { selectedEventTagIds.contains($0.tag) }
        guard !matching.isEmpty else { return nil }
        return (offset, tripsViewModel.dayIso(offset: offset), matching)
    }

    private func buildDaySection(
        offset: Int,
        isoDay: String,
        events: [TravelEvent],
        isLastSection: Bool
    ) -> EuropaDaySection {
        EuropaDaySection(
            dayOffset: offset,
            isoDay: isoDay,
            title: EventsDateHeaderFormatter.title(isoDay: isoDay),
            events: events,
            items: EuropaEventCountryGroup.sectionItems(
                from: events,
                sectionId: isoDay,
                language: currentLanguage,
                isLastSection: isLastSection
            )
        )
    }

    private func publishSections(_ nextSections: [EuropaDaySection]) {
        guard sections != nextSections else { return }
        sections = nextSections
    }

    private func missingWindows(from startOffset: Int) -> [(Int, Int)] {
        let horizon = AppConstants.travelHorizonDays
        guard startOffset < horizon else { return [] }
        return stride(from: startOffset, to: horizon, by: Self.rangeDays)
            .map { ($0, min($0 + Self.rangeDays - 1, horizon - 1)) }
            .filter { windowHasMissingOffset($0) }
    }

    private func windowHasMissingOffset(_ window: (Int, Int)) -> Bool {
        (window.0...window.1).contains { eventsByOffset[$0] == nil }
    }

    private func hasAnyCachedOffset(from startOffset: Int) -> Bool {
        let horizon = AppConstants.travelHorizonDays
        guard startOffset < horizon else { return false }
        return (startOffset..<horizon).contains { eventsByOffset[$0] != nil }
    }

    private static func waveSlices(from windows: [(Int, Int)]) -> [[(Int, Int)]] {
        let first = Array(windows.prefix(firstWaveWindows))
        let second = Array(windows.dropFirst(firstWaveWindows).prefix(secondWaveWindows))
        let third = Array(windows.dropFirst(firstWaveWindows + secondWaveWindows))
        return [first, second, third].filter { !$0.isEmpty }
    }

    private static func zeroTagCounts() -> [String: Int] {
        Dictionary(uniqueKeysWithValues: eventTagIds.map { ($0, 0) })
    }

    private static func originKey(from tripsViewModel: TripsViewModel) -> String {
        let joined = tripsViewModel.originIatas.joined(separator: ",")
        return joined.isEmpty ? tripsViewModel.selectedCity.id : joined
    }

    private static func clampedStartOffset(from tripsViewModel: TripsViewModel) -> Int {
        let maxOffset = max(0, AppConstants.travelHorizonDays - 1)
        return min(max(0, tripsViewModel.selectedDayOffset), maxOffset)
    }

    private static func warsawIsoDay(for event: TravelEvent) -> String {
        let date = Date(timeIntervalSince1970: TimeInterval(event.start_ms) / 1000)
        return AppConstants.isoDayFormatter.string(from: date)
    }

    static func selectedEventTags(from tripsViewModel: TripsViewModel) -> Set<String> {
        let explicit = Set(eventTagIds.filter { tripsViewModel.isTagSelected($0) })
        return explicit.isEmpty ? Set(eventTagIds) : explicit
    }
}
