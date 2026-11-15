import SwiftUI

struct CityBreakListView: View {
    @ObservedObject var tripsViewModel: TripsViewModel
    let onCityTap: () -> Void
    let onDayTap: () -> Void
    let onBack: () -> Void
    var bottomInset: CGFloat = 170

    @Environment(\.region) private var region
    @State private var customSelectedCountryIds: Set<String>?
    @State private var showCountryFilter = false

    var body: some View {
        VStack(spacing: 0) {
            stickyHeader
            citiesScroll
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .task(id: taskKey) {
            tripsViewModel.loadCitiesIfNeeded()
        }
        .onChange(of: tripsViewModel.selectedCity.id) { _, _ in
            customSelectedCountryIds = nil
        }
        .sheet(isPresented: $showCountryFilter) {
            CityBreakCountryFilterSheet(
                sections: allCountrySections,
                initialSelectedIds: effectiveSelectedCountryIds
            ) { updatedIds in
                applyCountrySelection(updatedIds)
            }
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

    private var allCountrySections: [CityBreakCountrySection] {
        CityBreakCountrySection.sections(from: tripsViewModel.availableCities, language: region.languageCode)
    }

    private var allCountryIds: Set<String> {
        Set(allCountrySections.map(\.id))
    }

    private var effectiveSelectedCountryIds: Set<String> {
        guard let custom = customSelectedCountryIds else { return allCountryIds }
        let valid = custom.intersection(allCountryIds)
        return valid.isEmpty ? allCountryIds : valid
    }

    private var filteredCountrySections: [CityBreakCountrySection] {
        let selected = effectiveSelectedCountryIds
        return allCountrySections.filter { selected.contains($0.id) }
    }

    private var lastSectionId: String? {
        filteredCountrySections.last?.id
    }

    private var countryFilterPillTitle: String {
        let selectedCount = effectiveSelectedCountryIds.count
        if allCountrySections.isEmpty || selectedCount == allCountrySections.count {
            return "Kraje"
        }
        if selectedCount == 1, let only = filteredCountrySections.first {
            return only.title
        }
        return "Kraje (\(selectedCount))"
    }

    private var stickyHeader: some View {
        VStack(spacing: 0) {
            headerTitleRow
            filterPillsRow
            Divider()
        }
        .background(Color(.systemGroupedBackground))
    }

    private var headerTitleRow: some View {
        HStack(spacing: Theme.Spacing.s) {
            Button {
                Haptics.selection()
                onBack()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Text("City Break")
                .font(Theme.Typo.sectionTitle)
                .foregroundStyle(.primary)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.top, Theme.Spacing.s)
        .padding(.bottom, Theme.Spacing.xs)
    }

    private var filterPillsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.s) {
                MapPickerPill(
                    title: DayLabels.pill(offset: tripsViewModel.selectedDayOffset),
                    action: onDayTap
                )
                MapPickerPill(title: originTitle, action: onCityTap)
                countryFilterPill
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.xs)
            .padding(.bottom, Theme.Spacing.m)
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var countryFilterPill: some View {
        if !allCountrySections.isEmpty {
            MapPickerPill(title: countryFilterPillTitle) {
                showCountryFilter = true
            }
        }
    }

    @ViewBuilder
    private var citiesScroll: some View {
        if allCountrySections.isEmpty && tripsViewModel.isLoadingCities {
            loadingCitiesState
        } else if filteredCountrySections.isEmpty {
            emptyCitiesState
        } else {
            citiesListScroll
        }
    }

    private var loadingCitiesState: some View {
        ProgressView()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyCitiesState: some View {
        EmptyState(
            icon: "building.2",
            title: "Brak kierunków",
            message: "Brak połączeń z wybranego miasta wylotu."
        )
        .padding(.horizontal, Theme.Spacing.l)
        .frame(maxHeight: .infinity)
    }

    private var citiesListScroll: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Theme.Spacing.s, pinnedViews: [.sectionHeaders]) {
                ForEach(filteredCountrySections) { section in
                    countrySectionView(section)
                }
            }
            .padding(.top, Theme.Spacing.xs)
            .padding(.bottom, bottomInset)
        }
        .refreshable {
            await tripsViewModel.refreshCities()
        }
    }

    private func countrySectionView(_ section: CityBreakCountrySection) -> some View {
        let lastCityId = section.cities.last?.id
        return Section {
            ForEach(section.cities) { city in
                cityRow(city)
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.bottom, interSectionBottomPadding(cityId: city.id, lastCityId: lastCityId, sectionId: section.id))
            }
        } header: {
            StickyDayHeaderView(title: section.title)
        }
    }

    private func interSectionBottomPadding(cityId: String, lastCityId: String?, sectionId: String) -> CGFloat {
        guard cityId == lastCityId, sectionId != lastSectionId else { return 0 }
        return Theme.Spacing.l
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

    private func applyCountrySelection(_ updatedIds: Set<String>) {
        if updatedIds == allCountryIds {
            customSelectedCountryIds = nil
            return
        }
        customSelectedCountryIds = updatedIds
    }
}
