import SwiftUI
import MapKit

struct MapScreen: View {
    @StateObject private var mapViewModel = MapViewModel()
    let category: MapCategory
    let onSelectCategory: (MapCategory) -> Void
    let onProfile: () -> Void
    @ObservedObject var tripsViewModel: TripsViewModel
    @StateObject private var cameraController = MapCameraController()

    @Binding var showStoryViewer: Bool
    @Binding var selectedStoryIndex: Int
    @Binding var storyPosts: [Post]
    @EnvironmentObject private var authManager: AuthManager

    @State private var showCityList = false
    @State private var showDayList = false
    @State private var showTripsDayList = false

    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            MapKitMapView(
                overlays: activeProvider.overlays,
                currentUserId: authManager.userId,
                initialRegion: activeProvider.initialRegion,
                initialDistance: activeProvider.initialDistance,
                maxZoomOutDistance: activeProvider.maxZoomOutDistance,
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

            if !showStoryViewer {
                VStack(spacing: 12) {
                    Spacer()
                    ToastView()
                    CategoryPill(
                        selection: category,
                        eventsLoading: mapViewModel.isLoading,
                        tripsLoading: tripsViewModel.isLoading,
                        onSelect: onSelectCategory
                    )
                    AppTabBar(
                        onHome: { onSelectCategory(.events) },
                        onProfile: onProfile
                    )
                    .padding(.bottom, 32)
                }
            }

            rightSlider
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.82), value: category)
        .onAppear {
            mapViewModel.currentUserId = authManager.userId
            mapViewModel.startPolling()
            let region = mapViewModel.initialRegion
            mapViewModel.fetchStories(
                swLat: region.center.latitude - region.span.latitudeDelta / 2,
                swLng: region.center.longitude - region.span.longitudeDelta / 2,
                neLat: region.center.latitude + region.span.latitudeDelta / 2,
                neLng: region.center.longitude + region.span.longitudeDelta / 2
            )
        }
        .onDisappear {
            mapViewModel.stopPolling()
        }
        .onChange(of: authManager.userId) { _, newValue in
            mapViewModel.currentUserId = newValue
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, category == .events else {
                mapViewModel.stopPolling()
                return
            }
            mapViewModel.startPolling()
        }
        .onChange(of: category) { _, newCategory in
            tripsViewModel.clearSelectionPublic()
            switch newCategory {
            case .events:
                mapViewModel.startPolling()
                cameraController.fly(to: mapViewModel.selectedCity.region)
            case .trips:
                mapViewModel.stopPolling()
                tripsViewModel.syncCity(mapViewModel.selectedCity)
                cameraController.fly(to: tripsViewModel.initialRegion, distance: tripsViewModel.initialDistance)
                Task { await CatalogueStore.shared.refresh() }
                tripsViewModel.refresh(showLoader: true)
            }
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
        .sheet(item: $tripsViewModel.selectedEventGroup) { _ in
            ClusterSheet(viewModel: tripsViewModel)
        }
        .sheet(item: $tripsViewModel.selectedCityBreak) { city in
            CityBreakSheet(viewModel: tripsViewModel, city: city)
        }
        .onChange(of: tripsViewModel.selectedEventGroup?.id) { _, id in
            guard id == nil else { return }
            tripsViewModel.clearSelectionPublic()
        }
    }

    private var activeProvider: any MapContentProvider {
        switch category {
        case .events: return mapViewModel
        case .trips: return tripsViewModel
        }
    }

    /// One selected city for both scopes — picking it in the local scope also
    /// sets the departure city.
    private var sharedCity: City {
        category == .trips ? tripsViewModel.selectedCity : mapViewModel.selectedCity
    }

    private func selectCity(_ city: City) {
        mapViewModel.selectCity(city)
        switch category {
        case .events:
            cameraController.fly(to: city.region)
        case .trips:
            tripsViewModel.selectCity(city)
            cameraController.fly(to: tripsViewModel.initialRegion, distance: tripsViewModel.initialDistance)
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
        tripsViewModel.selectGroup(posts: group.posts, cities: group.cities)
    }

    private func handleCityTap(_ city: CityPin) {
        Haptics.impact(.medium)
        tripsViewModel.selectedCityBreak = city.city
        cameraController.flyToAboveSheet(city.coordinate)
    }

    private func handlePinTap(_ pin: MapPin) {
        let post = pin.post
        if category == .trips {
            Haptics.impact(.medium)
            guard tripsViewModel.selectTravelEvent(postId: post.id, group: pin.group) else { return }
            cameraController.flyToAboveSheet(post.coordinate)
            return
        }
        Haptics.impact(.medium)
        storyPosts = pin.group.isEmpty ? [post] : pin.group
        selectedStoryIndex = 0
        showStoryViewer = true
    }


}
