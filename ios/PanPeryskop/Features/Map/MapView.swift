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
    @State private var showAirportList = false
    @State private var showTripsEventCard = false

    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            MapKitMapView(
                overlays: activeProvider.overlays,
                currentUserId: authManager.userId,
                initialRegion: activeProvider.initialRegion,
                zoom: activeProvider.defaultZoom,
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

            VStack(spacing: 0) {
                MapFilterBar(
                    category: category,
                    mapViewModel: mapViewModel,
                    tripsViewModel: tripsViewModel,
                    onCityTap: { showCityList = true },
                    onAirportTap: { showAirportList = true },
                    onDayTap: { showDayList = true },
                    onTripDayTap: { showTripsDayList = true }
                )
                Spacer()
            }

            if !showStoryViewer {
                VStack {
                    Spacer()
                    AppTabBar(
                        category: category,
                        eventsLoading: mapViewModel.isLoading,
                        tripsLoading: tripsViewModel.isLoading,
                        onSelectCategory: onSelectCategory,
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
            mapViewModel.runMediaNearbyCheck()
            ProximityMonitor.shared.requestNotificationPermissionIfNeeded()
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
            if phase == .active {
                mapViewModel.startPolling()
            } else {
                mapViewModel.stopPolling()
            }
        }
        .onChange(of: category) { _, newCategory in
            // Deterministic fly: events → the selected city (never a stale viewport),
            // trips → the Europe overview.
            switch newCategory {
            case .events:
                cameraController.fly(to: mapViewModel.selectedCity.region)
            case .trips:
                cameraController.fly(to: tripsViewModel.initialRegion)
                tripsViewModel.refresh()
            }
        }
        .sheet(isPresented: $showCityList) {
            CityListView(selectedCity: mapViewModel.selectedCity) { city in
                mapViewModel.selectCity(city)
                cameraController.fly(to: city.region)
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
        .sheet(isPresented: $showAirportList) {
            AirportPickerView(selectedAirport: tripsViewModel.selectedAirport) { airport in
                tripsViewModel.selectAirport(airport)
                cameraController.fly(to: tripsViewModel.initialRegion)
            }
        }
        .sheet(isPresented: $showTripsEventCard, onDismiss: {
            tripsViewModel.clearSelectionPublic()
        }) {
            TripsEventSheet(viewModel: tripsViewModel)
        }
    }

    private var activeProvider: MapContentProvider {
        switch category {
        case .events: return mapViewModel
        case .trips: return tripsViewModel
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
        guard case .pin(let pin) = overlay else { return }
        let post = pin.post
        if category == .trips {
            Haptics.impact(.medium)
            tripsViewModel.selectTravelEvent(postId: post.id, group: pin.group)
            cameraController.flyToAboveSheet(post.coordinate)
            showTripsEventCard = true
            return
        }
        Haptics.impact(.medium)
        storyPosts = pin.group.isEmpty ? [post] : pin.group
        selectedStoryIndex = 0
        showStoryViewer = true
    }


}
