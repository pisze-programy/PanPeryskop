import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.scenePhase) private var scenePhase
    @Binding var pendingStoryId: String?

    @StateObject private var mapViewModel = MapViewModel()
    @StateObject private var tripsViewModel = TripsViewModel()
    @State private var router = AppRouter()
    @ObservedObject private var catalogueStore = CatalogueStore.shared

    var body: some View {
        ZStack(alignment: .bottom) {
            mapTab
            listTab
            profileTab
            bottomOverlay
            storyViewerOverlay
        }
        .ignoresSafeArea(.keyboard)
        .task {
            await handleInitialTask()
        }
        .task {
            await MetaSignals.beganAfterConsent()
            ProductAnalytics.trackingAnswered()
        }
        .onChange(of: pendingStoryId) { _, newId in
            handlePendingStoryChange(newId)
        }
        .onChange(of: router.activeTab) { _, newTab in
            handleActiveTabChange(newTab)
        }
        .onChange(of: router.category) { _, newCategory in
            handleCategoryChange(newCategory)
        }
        .onChange(of: catalogueStore.catalogue.version) { _, _ in
            mapViewModel.reloadCities()
            tripsViewModel.reloadCatalogue()
        }
        .onChange(of: catalogueStore.updateSuggested) { _, suggested in
            guard suggested else { return }
            ToastManager.shared.show("Dostępna aktualizacja aplikacji", seconds: 3)
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await catalogueStore.refresh() }
        }
        .sheet(item: $tripsViewModel.selectedEventGroup, onDismiss: {
            tripsViewModel.clearSelectionPublic()
        }) { _ in
            ClusterSheet(viewModel: tripsViewModel)
                .trackScreen("cluster")
        }
        .onChange(of: tripsViewModel.selectedEventGroup?.contentId) { _, _ in
            handleSelectedEventGroupChange()
        }
    }

    private var mapTab: some View {
        @Bindable var bindableRouter = router
        return MapScreen(
            mapViewModel: mapViewModel,
            tripsViewModel: tripsViewModel,
            category: router.category,
            isActiveTab: router.activeTab == .map,
            onSelectCity: selectSharedCity,
            showStoryViewer: $bindableRouter.showStoryViewer,
            selectedStoryIndex: $bindableRouter.selectedStoryIndex,
            storyPosts: $bindableRouter.storyPosts
        )
        .environmentObject(authManager)
        .opacity(router.activeTab == .map ? 1 : 0)
        .allowsHitTesting(router.activeTab == .map)
        .trackScreen("map")
    }

    @ViewBuilder
    private var listTab: some View {
        @Bindable var bindableRouter = router
        if router.activeTab == .list {
            EventsListScreen(
                mapViewModel: mapViewModel,
                tripsViewModel: tripsViewModel,
                category: router.category,
                onSelectCity: selectSharedCity,
                isShowingSublist: $bindableRouter.isShowingCityBreakSublist,
                popToRootToken: router.listNavigationResetToken
            )
            .trackScreen("events_list")
        }
    }

    @ViewBuilder
    private var profileTab: some View {
        if router.activeTab == .profile {
            ProfileView()
                .environmentObject(authManager)
                .trackScreen("profile")
        }
    }

    @ViewBuilder
    private var bottomOverlay: some View {
        if !router.showStoryViewer {
            ZStack(alignment: .bottom) {
                bottomBlurBar
                bottomControls
            }
        }
    }

    @ViewBuilder
    private var bottomBlurBar: some View {
        if router.activeTab != .map {
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                StoryBlurBar(bottomFade: false)
                    .frame(height: 150)
            }
            .ignoresSafeArea(edges: .bottom)
            .allowsHitTesting(false)
        }
    }

    private var bottomControls: some View {
        VStack(spacing: 12) {
            ToastView()
            categoryPill
            AppTabBar(
                activeTab: router.activeTab,
                onSelect: { router.selectTab($0) }
            )
            .padding(.bottom, 32)
        }
    }

    @ViewBuilder
    private var categoryPill: some View {
        if showsCategoryPill {
            CategoryPill(
                selection: router.category,
                eventsLoading: mapViewModel.isLoading,
                tripsLoading: tripsViewModel.isLoading,
                onSelect: selectCategory
            )
        }
    }

    @ViewBuilder
    private var storyViewerOverlay: some View {
        @Bindable var bindableRouter = router
        if router.showStoryViewer {
            StoryFullScreenView(
                posts: router.storyPosts,
                startIndex: router.selectedStoryIndex,
                isPresented: $bindableRouter.showStoryViewer,
                actions: mapViewModel
            )
            .zIndex(999)
            .transition(.opacity)
            .trackScreen("story")
        }
    }

    private var showsCategoryPill: Bool {
        router.activeTab == .map || (router.activeTab == .list && !router.isShowingCityBreakSublist)
    }

    private func selectCategory(_ category: MapCategory) {
        if category == .trips {
            tripsViewModel.syncCity(mapViewModel.selectedCity)
        }
        router.category = category
    }

    private func selectSharedCity(_ city: City) {
        MetaSignals.content(kind: .city, id: city.id, name: city.name)
        ProductAnalytics.contentOpened(kind: .city, id: city.id)
        mapViewModel.selectCity(city)
        syncTripsCity(city)
    }

    private func syncTripsCity(_ city: City) {
        if router.activeTab == .map, router.category == .trips {
            tripsViewModel.selectCity(city)
            return
        }
        tripsViewModel.syncCity(city)
        tripsViewModel.loadCities()
    }

    private func handleInitialTask() async {
        if tripsViewModel.selectedCity.id != mapViewModel.selectedCity.id {
            tripsViewModel.syncCity(mapViewModel.selectedCity)
            tripsViewModel.loadCities()
        }
        await catalogueStore.refresh()
        await authManager.refreshMe()
        guard let storyId = pendingStoryId else { return }
        pendingStoryId = nil
        await router.openStory(id: storyId, map: mapViewModel)
    }

    private func handlePendingStoryChange(_ newId: String?) {
        guard let newId else { return }
        pendingStoryId = nil
        Task { await router.openStory(id: newId, map: mapViewModel) }
    }

    private func handleActiveTabChange(_ newTab: AppTab) {
        guard newTab == .map else { return }
        ProductAnalytics.screen("map")
    }

    private func handleCategoryChange(_ newCategory: MapCategory) {
        tripsViewModel.clearSelectionPublic()
        guard newCategory == .trips else { return }
        tripsViewModel.syncCity(mapViewModel.selectedCity)
        tripsViewModel.loadCitiesIfNeeded()
    }

    private func handleSelectedEventGroupChange() {
        guard let group = tripsViewModel.selectedEventGroup else {
            tripsViewModel.clearSelectionPublic()
            return
        }
        let name = group.events.first?.title ?? group.cities.first?.displayName ?? group.contentId
        MetaSignals.content(kind: .event, id: group.contentId, name: name)
        ProductAnalytics.contentOpened(kind: .event, id: group.contentId)
    }
}
