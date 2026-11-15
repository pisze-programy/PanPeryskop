import SwiftUI

struct EventsListScreen: View {
    @ObservedObject var mapViewModel: MapViewModel
    @ObservedObject var tripsViewModel: TripsViewModel
    let category: MapCategory
    let onSelectCity: (City) -> Void
    @Binding var isShowingSublist: Bool
    let popToRootToken: Int

    @StateObject private var localListViewModel = LocalEventsListViewModel()
    @StateObject private var europaListViewModel = EuropaEventsListViewModel()
    @State private var path: [ListRoute] = []
    @State private var showCityList = false
    @State private var showLocalDayList = false
    @State private var showTripsDayList = false
    @State private var browserTarget: BrowserTarget?

    private enum ListRoute: Hashable {
        case cityBreak
    }

    private struct BrowserTarget: Identifiable {
        let id = UUID()
        let url: URL
        let allowAnyHost: Bool
    }

    var body: some View {
        NavigationStack(path: $path) {
            rootList
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: ListRoute.self) { route in
                    destinationView(for: route)
                }
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .onAppear {
            syncSublistState()
            syncTripsCityIfNeeded(for: category)
        }
        .onDisappear {
            isShowingSublist = false
        }
        .onChange(of: path) { _, _ in
            syncSublistState()
        }
        .onChange(of: category) { _, newCategory in
            handleCategoryChange(newCategory)
        }
        .onChange(of: popToRootToken) { _, _ in
            popToRoot()
        }
        .sheet(isPresented: $showCityList) {
            CityListView(selectedCity: sharedCity) { city in
                onSelectCity(city)
            }
        }
        .sheet(isPresented: $showLocalDayList) {
            DayListSheet(
                title: "Wybierz dzień",
                offsets: MapViewModel.dayOffsets,
                selected: mapViewModel.selectedDayOffset,
                onSelect: { mapViewModel.commitDay($0) }
            )
        }
        .sheet(isPresented: $showTripsDayList) {
            DayListSheet(
                title: "Wybierz dzień",
                offsets: TripsViewModel.dayOffsets,
                selected: tripsViewModel.selectedDayOffset,
                onSelect: { tripsViewModel.commitDay($0) }
            )
        }
        .sheet(item: $browserTarget) { target in
            InAppBrowserView(
                url: target.url,
                allowAnyHost: target.allowAnyHost,
                onClose: { browserTarget = nil }
            )
            .presentationDetents([.medium, .large])
        }
    }

    @ViewBuilder
    private var rootList: some View {
        switch category {
        case .events:
            LocalEventsListView(
                mapViewModel: mapViewModel,
                listViewModel: localListViewModel,
                onCityTap: { showCityList = true },
                onDayTap: { showLocalDayList = true },
                onSelectPost: handleSelectPost
            )
        case .trips:
            EuropaEventsListView(
                tripsViewModel: tripsViewModel,
                listViewModel: europaListViewModel,
                onCityTap: { showCityList = true },
                onDayTap: { showTripsDayList = true },
                onOpenAllCities: { path.append(.cityBreak) }
            )
        }
    }

    @ViewBuilder
    private func destinationView(for route: ListRoute) -> some View {
        switch route {
        case .cityBreak:
            CityBreakListView(
                tripsViewModel: tripsViewModel,
                onCityTap: { showCityList = true },
                onDayTap: { showTripsDayList = true },
                onBack: { popToRoot() }
            )
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var sharedCity: City {
        category == .trips ? tripsViewModel.selectedCity : mapViewModel.selectedCity
    }

    private func syncSublistState() {
        let showing = !path.isEmpty
        Task { @MainActor in
            isShowingSublist = showing
        }
    }

    private func popToRoot() {
        guard !path.isEmpty else { return }
        path.removeAll()
    }

    private func handleCategoryChange(_ newCategory: MapCategory) {
        popToRoot()
        isShowingSublist = false
        syncTripsCityIfNeeded(for: newCategory)
    }

    private func syncTripsCityIfNeeded(for activeCategory: MapCategory) {
        guard activeCategory == .trips else { return }
        tripsViewModel.syncCity(mapViewModel.selectedCity)
    }

    private func handleSelectPost(_ post: Post, showtime: String?) {
        guard let target = post.externalLinkTarget(selectedShowtime: showtime) else { return }
        switch target {
        case .inApp(let url, let allowAnyHost):
            browserTarget = BrowserTarget(url: url, allowAnyHost: allowAnyHost)
        case .systemSafari(let url):
            MetaSignals.outbound(url: url)
            ProductAnalytics.outbound(url: url)
            UIApplication.shared.open(url)
        }
    }
}
