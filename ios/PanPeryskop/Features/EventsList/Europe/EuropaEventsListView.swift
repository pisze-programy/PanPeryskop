import SwiftUI

struct EuropaEventsListView: View {
    @ObservedObject var tripsViewModel: TripsViewModel
    @ObservedObject var listViewModel: EuropaEventsListViewModel
    let onCityTap: () -> Void
    let onDayTap: () -> Void
    let onOpenAllCities: () -> Void
    var bottomInset: CGFloat = 170

    @Environment(\.region) private var region

    private static let previewCityLimit = 5
    private static let filterTrailingExtraPadding: CGFloat = 6

    var body: some View {
        VStack(spacing: 0) {
            topFilterBar
            eventsScrollContent
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .task(id: taskKey) {
            tripsViewModel.loadCitiesIfNeeded()
            await listViewModel.loadIfNeeded(using: tripsViewModel, language: region.languageCode)
        }
        .onChange(of: tagFilterKey) { _, _ in
            listViewModel.syncTags(using: tripsViewModel, language: region.languageCode)
        }
    }

    private var taskKey: String {
        "\(tripsViewModel.selectedCity.id)|\(tripsViewModel.selectedDayOffset)|\(region.languageCode)"
    }

    private var originTitle: String {
        let iatas = tripsViewModel.originIatas.joined(separator: ", ")
        guard !iatas.isEmpty else { return tripsViewModel.selectedCity.name }
        return "\(tripsViewModel.selectedCity.name) · \(iatas)"
    }

    private var visibleEventTags: [TripsViewModel.TravelTag] {
        let tags = TripsViewModel.TravelTag.allCases.filter { $0 != .citybreak }
        let pills = tags.map { TagPill(id: $0.rawValue, label: $0.label) }
        return TagSorting.sorted(pills, counts: listViewModel.tagCounts)
            .compactMap { TripsViewModel.TravelTag(rawValue: $0.id) }
    }

    private var effectiveEventTagIds: Set<String> {
        EuropaEventsListViewModel.selectedEventTags(from: tripsViewModel)
    }

    private var tagFilterKey: String {
        effectiveEventTagIds.sorted().joined(separator: ",")
    }

    private var previewCities: [TravelCity] {
        Array(CityBreakCountrySection.rankedCities(tripsViewModel.availableCities).prefix(Self.previewCityLimit))
    }

    private var cityBreakMoreTitle: String {
        "Zobacz więcej (\(tripsViewModel.availableCities.count))"
    }

    private var topFilterBar: some View {
        VStack(spacing: 0) {
            filterPillsRow
            Divider()
        }
        .background(Color(.systemGroupedBackground))
    }

    private var filterPillsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.s) {
                MapPickerPill(
                    title: DayLabels.pill(offset: tripsViewModel.selectedDayOffset),
                    action: onDayTap
                )
                MapPickerPill(title: originTitle, action: onCityTap)
                    .padding(.trailing, Theme.Spacing.xs)
                ForEach(visibleEventTags) { tag in
                    eventFilterChip(for: tag)
                }
            }
            .padding(.leading, Theme.Spacing.l)
            .padding(.trailing, Theme.Spacing.l + Self.filterTrailingExtraPadding)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.m)
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func eventFilterChip(for tag: TripsViewModel.TravelTag) -> some View {
        Chip(
            label: tag.label,
            isSelected: effectiveEventTagIds.contains(tag.rawValue),
            badgeCount: listViewModel.tagCounts[tag.rawValue] ?? 0,
            showsBadgeWhenEmpty: true
        ) {
            toggleEventTag(tag.rawValue)
        }
    }

    private var eventsScrollContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Theme.Spacing.s, pinnedViews: [.sectionHeaders]) {
                cityBreakPreviewBlock
                eventsSectionsContent
            }
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, bottomInset)
        }
        .refreshable {
            await listViewModel.refresh(using: tripsViewModel, language: region.languageCode)
        }
    }

    @ViewBuilder
    private var cityBreakPreviewBlock: some View {
        if !previewCities.isEmpty {
            recommendedCitiesSection
        }
    }

    private var recommendedCitiesSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            recommendedCitiesHeader
            ForEach(previewCities) { city in
                cityRow(city)
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.bottom, Theme.Spacing.l)
    }

    private var recommendedCitiesHeader: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("City Break")
                .font(Theme.Typo.sectionTitle)
                .foregroundStyle(.primary)
            Spacer(minLength: Theme.Spacing.s)
            Button {
                Haptics.selection()
                onOpenAllCities()
            } label: {
                HStack(spacing: Theme.Spacing.xs) {
                    Text(cityBreakMoreTitle)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.accentColor)
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private var eventsSectionsContent: some View {
        if listViewModel.isInitialLoading && listViewModel.sections.isEmpty {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Spacing.xxl)
        } else if listViewModel.hasFailed && listViewModel.sections.isEmpty {
            ErrorState(message: "Nie udało się pobrać wydarzeń") {
                listViewModel.retry(using: tripsViewModel, language: region.languageCode)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.m)
        } else if listViewModel.sections.isEmpty && !listViewModel.hasMore && !listViewModel.isLoadingMore {
            EmptyState(
                icon: "airplane",
                title: "Brak nadchodzących wydarzeń",
                message: "Zmień miasto wylotu lub filtry, aby zobaczyć inne propozycje."
            )
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.m)
        } else {
            daySectionsList
            paginationFooter
        }
    }

    private var daySectionsList: some View {
        ForEach(listViewModel.sections) { section in
            daySectionView(section)
        }
    }

    private func daySectionView(_ section: EuropaDaySection) -> some View {
        Section {
            ForEach(section.items) { item in
                sectionItemView(item)
            }
        } header: {
            StickyDayHeaderView(title: section.title)
        }
    }

    @ViewBuilder
    private func sectionItemView(_ item: EuropaSectionItem) -> some View {
        switch item {
        case .countryHeader(_, let title, let isFirst):
            countryHeaderRow(title: title, isFirst: isFirst)
        case .event(_, let event, let addsSectionSpacing):
            eventRow(event, addsSectionSpacing: addsSectionSpacing)
        }
    }

    private func countryHeaderRow(title: String, isFirst: Bool) -> some View {
        Text(title)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, isFirst ? Theme.Spacing.xs : Theme.Spacing.s)
    }

    @ViewBuilder
    private var paginationFooter: some View {
        if listViewModel.isLoadingMore {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Spacing.l)
        } else if listViewModel.hasFailed {
            ErrorState(message: "Nie udało się pobrać kolejnych wydarzeń") {
                listViewModel.retry(using: tripsViewModel, language: region.languageCode)
            }
            .padding(.horizontal, Theme.Spacing.l)
        } else if listViewModel.hasMore {
            Color.clear
                .frame(height: 1)
                .onAppear {
                    listViewModel.loadMoreIfNeeded(using: tripsViewModel, language: region.languageCode)
                }
        }
    }

    private func cityRow(_ city: TravelCity) -> some View {
        EuropaCityRowCard(
            city: city,
            originIatas: tripsViewModel.originIatas,
            routeOverride: tripsViewModel.routeLabel(for: city)
        ) {
            tripsViewModel.selectGroup(posts: [], cities: [city])
        }
    }

    private func eventRow(_ event: TravelEvent, addsSectionSpacing: Bool) -> some View {
        EuropaEventRowCard(event: event) {
            tripsViewModel.openEventFromList(event)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.bottom, addsSectionSpacing ? Theme.Spacing.l : 0)
    }

    private func toggleEventTag(_ id: String) {
        let explicitSelected = visibleEventTags.map(\.rawValue).filter { tripsViewModel.isTagSelected($0) }
        if explicitSelected.isEmpty {
            selectComplementEventTags(excluding: id)
            return
        }
        if explicitSelected.contains(id), explicitSelected.count <= 1 { return }
        tripsViewModel.toggleTag(id)
    }

    private func selectComplementEventTags(excluding excludedId: String) {
        let remaining = visibleEventTags.map(\.rawValue).filter { $0 != excludedId }
        for tagId in remaining {
            tripsViewModel.toggleTag(tagId)
        }
    }
}
