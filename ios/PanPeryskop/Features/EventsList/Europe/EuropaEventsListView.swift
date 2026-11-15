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

    var body: some View {
        VStack(spacing: 0) {
            topFilterBar
            eventsScrollContent
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .task(id: taskKey) {
            tripsViewModel.loadCitiesIfNeeded()
            await listViewModel.loadIfNeeded(using: tripsViewModel)
        }
        .onChange(of: tagFilterKey) { _, _ in
            listViewModel.syncTags(using: tripsViewModel)
        }
    }

    private var taskKey: String {
        "\(tripsViewModel.selectedCity.id)|\(tripsViewModel.selectedDayOffset)"
    }

    private var originTitle: String {
        let iatas = tripsViewModel.originIatas.joined(separator: ", ")
        guard !iatas.isEmpty else { return tripsViewModel.selectedCity.name }
        return "\(tripsViewModel.selectedCity.name) · \(iatas)"
    }

    private var visibleEventTags: [TripsViewModel.TravelTag] {
        tripsViewModel.sortedTags.filter { $0 != .citybreak }
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

    private var lastSectionId: String? {
        listViewModel.sections.last?.id
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
                ForEach(visibleEventTags) { tag in
                    Chip(label: tag.label, isSelected: effectiveEventTagIds.contains(tag.rawValue)) {
                        toggleEventTag(tag.rawValue)
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.m)
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
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
            await listViewModel.refresh(using: tripsViewModel)
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
                    Text("Zobacz więcej")
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
                listViewModel.retry(using: tripsViewModel)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.m)
        } else if listViewModel.sections.isEmpty && !listViewModel.hasMore {
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
        let countryGroups = EuropaEventCountryGroup.groups(from: section.events, language: region.languageCode)
        let firstGroupId = countryGroups.first?.id
        let lastGroupId = countryGroups.last?.id
        return Section {
            ForEach(countryGroups) { group in
                countryGroupView(
                    group,
                    isFirstGroup: group.id == firstGroupId,
                    isLastGroup: group.id == lastGroupId,
                    isLastSection: section.id == lastSectionId
                )
            }
        } header: {
            StickyDayHeaderView(title: section.title)
        }
    }

    private func countryGroupView(
        _ group: EuropaEventCountryGroup,
        isFirstGroup: Bool,
        isLastGroup: Bool,
        isLastSection: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text(group.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, isFirstGroup ? Theme.Spacing.xs : Theme.Spacing.s)
            ForEach(group.events) { event in
                eventRow(event)
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.bottom, interSectionBottomPadding(isLastGroup: isLastGroup, isLastSection: isLastSection))
    }

    private func interSectionBottomPadding(isLastGroup: Bool, isLastSection: Bool) -> CGFloat {
        guard isLastGroup, !isLastSection else { return 0 }
        return Theme.Spacing.l
    }

    @ViewBuilder
    private var paginationFooter: some View {
        if listViewModel.isLoadingMore {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Spacing.l)
        } else if listViewModel.hasFailed {
            ErrorState(message: "Nie udało się pobrać kolejnych wydarzeń") {
                listViewModel.retry(using: tripsViewModel)
            }
            .padding(.horizontal, Theme.Spacing.l)
        } else if listViewModel.hasMore {
            Color.clear
                .frame(height: 1)
                .onAppear {
                    listViewModel.loadMoreIfNeeded(using: tripsViewModel)
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

    private func eventRow(_ event: TravelEvent) -> some View {
        EuropaEventRowCard(event: event) {
            tripsViewModel.openEventFromList(event)
        }
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
