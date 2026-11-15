import SwiftUI
import MapKit

struct MapScreen: View {
    @ObservedObject var mapViewModel: MapViewModel
    @ObservedObject var tripsViewModel: TripsViewModel
    let category: MapCategory
    let isActiveTab: Bool
    let onSelectCity: (City) -> Void

    @Binding var showStoryViewer: Bool
    @Binding var selectedStoryIndex: Int
    @Binding var storyPosts: [Post]

    @StateObject private var cameraController = MapCameraController()
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.scenePhase) private var scenePhase

    @State private var showCityList = false
    @State private var showDayList = false
    @State private var showTripsDayList = false
    @State private var hasRequestedInitialEvents = false
    @State private var activeMapCategory: MapCategory?
    @State private var syncedCityId: String?

    var body: some View {
        ZStack {
            MapKitMapView(
                overlays: activeProvider.overlays,
                currentUserId: authManager.userId,
                initialRegion: activeProvider.initialRegion,
                initialDistance: activeProvider.initialDistance,
                maxZoomOutDistance: activeProvider.maxZoomOutDistance,
                clusterConfig: activeProvider.clusterConfig,
                onRegionChange: { swLat, swLng, neLat, neLng in
                    activeProvider.onRegionChange(swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng)
                },
                onCameraSettled: { region in
                    activeProvider.onCameraSettled(region)
                },
                onTap: handleTap,
                cameraController: cameraController
            )
            .ignoresSafeArea()

            fpsOverlay

            VStack(spacing: 0) {
                MapFilterBar(
                    category: category,
                    mapViewModel: mapViewModel,
                    tripsViewModel: tripsViewModel,
                    onCityTap: { showCityList = true },
                    onDayTap: { showDayList = true },
                    onTripDayTap: { showTripsDayList = true }
                )
                Spacer()
            }

            rightSlider
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.82), value: category)
        .onAppear {
            handleAppear()
        }
        .onDisappear {
            mapViewModel.stopPolling()
        }
        .onChange(of: authManager.userId) { _, newValue in
            mapViewModel.currentUserId = newValue
        }
        .onChange(of: scenePhase) { _, _ in
            syncPolling()
        }
        .onChange(of: isActiveTab) { _, active in
            handleActiveTabChange(active)
        }
        .onChange(of: category) { _, newCategory in
            handleCategoryChange(newCategory)
        }
        .onChange(of: tripsViewModel.selectionId) { _, _ in
            guard isActiveTab, let coordinate = tripsViewModel.selectionCoordinate else { return }
            cameraController.flyToAboveSheet(coordinate)
        }
        .sheet(isPresented: $showCityList) {
            CityListView(selectedCity: sharedCity) { city in
                selectCity(city)
            }
        }
        .sheet(isPresented: $showDayList) {
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
    }

    private var activeProvider: any MapContentProvider {
        switch category {
        case .events: return mapViewModel
        case .trips: return tripsViewModel
        }
    }

    private var sharedCity: City {
        category == .trips ? tripsViewModel.selectedCity : mapViewModel.selectedCity
    }

    @ViewBuilder
    private var fpsOverlay: some View {
        if AppConstants.showsFPS {
            VStack {
                Spacer()
                HStack {
                    FPSOverlay()
                    Spacer()
                }
                .padding(.leading, Theme.Spacing.l)
                .padding(.bottom, 4)
            }
            .allowsHitTesting(false)
        }
    }

    @ViewBuilder
    private var rightSlider: some View {
        switch category {
        case .events:
            HStack {
                Spacer()
                DaySliderView(viewModel: mapViewModel)
                    .padding(.trailing, 10)
            }
        case .trips:
            HStack {
                Spacer()
                TripsDaySliderView(viewModel: tripsViewModel)
                    .padding(.trailing, 10)
            }
        }
    }

    private func handleAppear() {
        mapViewModel.currentUserId = authManager.userId
        activeMapCategory = category
        syncedCityId = mapViewModel.selectedCity.id
        syncPolling()
        loadInitialScopeIfNeeded()
    }

    private func handleActiveTabChange(_ active: Bool) {
        syncPolling()
        guard active else { return }
        syncDeferredMapUpdates()
    }

    private func handleCategoryChange(_ newCategory: MapCategory) {
        guard isActiveTab else {
            syncPolling()
            return
        }
        applyCategoryTransition(to: newCategory)
    }

    private func syncPolling() {
        guard isActiveTab, category == .events, scenePhase == .active else {
            mapViewModel.stopPolling()
            return
        }
        mapViewModel.startPolling()
    }

    private func loadInitialScopeIfNeeded() {
        guard isActiveTab else { return }
        switch category {
        case .events:
            fetchInitialEventsIfNeeded()
        case .trips:
            enterTripsMode(forceRefresh: true)
        }
    }

    private func syncDeferredMapUpdates() {
        if activeMapCategory != category {
            applyCategoryTransition(to: category, forceTripsRefresh: false)
            return
        }
        let cityChanged = syncedCityId != mapViewModel.selectedCity.id
        syncedCityId = mapViewModel.selectedCity.id
        switch category {
        case .events:
            refreshEventsIfCityChanged(cityChanged)
        case .trips:
            refreshTripsIfNeeded(cityChanged: cityChanged)
        }
    }

    private func refreshEventsIfCityChanged(_ cityChanged: Bool) {
        guard cityChanged else { return }
        cameraController.fly(to: mapViewModel.initialRegion)
    }

    private func refreshTripsIfNeeded(cityChanged: Bool) {
        if cityChanged {
            cameraController.fly(to: tripsViewModel.initialRegion, distance: tripsViewModel.initialDistance)
        }
        guard !tripsViewModel.showPins, !tripsViewModel.isLoading else { return }
        tripsViewModel.refresh(showLoader: true)
    }

    private func applyCategoryTransition(to newCategory: MapCategory, forceTripsRefresh: Bool = true) {
        activeMapCategory = newCategory
        syncedCityId = mapViewModel.selectedCity.id
        tripsViewModel.clearSelectionPublic()
        syncPolling()
        switch newCategory {
        case .events:
            enterEventsMode()
        case .trips:
            enterTripsMode(forceRefresh: forceTripsRefresh)
        }
    }

    private func enterEventsMode() {
        cameraController.fly(to: mapViewModel.initialRegion)
        fetchInitialEventsIfNeeded()
    }

    private func enterTripsMode(forceRefresh: Bool) {
        tripsViewModel.syncCity(mapViewModel.selectedCity)
        cameraController.fly(to: tripsViewModel.initialRegion, distance: tripsViewModel.initialDistance)
        Task { await CatalogueStore.shared.refresh() }
        guard forceRefresh || (!tripsViewModel.showPins && !tripsViewModel.isLoading) else { return }
        tripsViewModel.refresh(showLoader: true)
    }

    private func fetchInitialEventsIfNeeded() {
        guard !hasRequestedInitialEvents else { return }
        hasRequestedInitialEvents = true
        let region = mapViewModel.initialRegion
        mapViewModel.fetchStories(
            swLat: region.center.latitude - region.span.latitudeDelta / 2,
            swLng: region.center.longitude - region.span.longitudeDelta / 2,
            neLat: region.center.latitude + region.span.latitudeDelta / 2,
            neLng: region.center.longitude + region.span.longitudeDelta / 2
        )
    }

    private func selectCity(_ city: City) {
        syncedCityId = city.id
        onSelectCity(city)
        flyAfterCitySelect()
    }

    private func flyAfterCitySelect() {
        switch category {
        case .events:
            cameraController.fly(to: mapViewModel.selectedCity.region)
        case .trips:
            cameraController.fly(to: tripsViewModel.initialRegion, distance: tripsViewModel.initialDistance)
        }
    }

    private func handleTap(_ overlay: MapOverlay) {
        switch overlay {
        case .pin(let pin): handlePinTap(pin)
        case .city(let city): handleCityTap(city)
        case .group(let group): handleGroupTap(group)
        default: return
        }
    }

    private func handleGroupTap(_ group: MapGroup) {
        Haptics.impact(.medium)
        ProductAnalytics.pinTapped(kind: "group", id: group.id)
        guard category == .trips else {
            openStoryViewer(group.posts)
            return
        }
        tripsViewModel.selectGroup(posts: group.posts, cities: group.cities)
    }

    private func handleCityTap(_ city: CityPin) {
        guard category == .trips else { return }
        Haptics.impact(.medium)
        ProductAnalytics.pinTapped(kind: "city", id: city.city.id)
        tripsViewModel.selectGroup(posts: [], cities: [city.city])
    }

    private func handlePinTap(_ pin: MapPin) {
        let post = pin.post
        ProductAnalytics.pinTapped(kind: category == .trips ? "event" : "story", id: post.id)
        if category == .trips {
            Haptics.impact(.medium)
            _ = tripsViewModel.selectTravelEvent(postId: post.id)
            return
        }
        openStoryViewer([post])
    }

    private func openStoryViewer(_ posts: [Post]) {
        guard let first = posts.first else { return }
        MetaSignals.content(kind: .story, id: first.id, name: first.id)
        ProductAnalytics.contentOpened(kind: .story, id: first.id)
        Haptics.impact(.medium)
        storyPosts = posts
        selectedStoryIndex = 0
        showStoryViewer = true
    }
}
