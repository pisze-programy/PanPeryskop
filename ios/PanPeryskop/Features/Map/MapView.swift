import SwiftUI
import MapKit

struct MapScreen: View {
    @StateObject private var mapViewModel = MapViewModel()
    @ObservedObject var tripsViewModel: TripsViewModel
    @StateObject private var cameraController = MapCameraController()

    @Binding var showStoryViewer: Bool
    @Binding var selectedStoryIndex: Int
    @Binding var storyPosts: [Post]
    @EnvironmentObject private var authManager: AuthManager

    @State private var activeCategory: MapCategory = .events
    @State private var showCityList = false
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
                    category: activeCategory,
                    mapViewModel: mapViewModel,
                    tripsViewModel: tripsViewModel,
                    onCityTap: { showCityList = true },
                    onAirportTap: { showAirportList = true }
                )
                Spacer()
            }

            VStack {
                Spacer()
                CategoryPill(selection: $activeCategory)
                    .padding(.bottom, 112)
            }

            rightSlider
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.82), value: activeCategory)
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
        .onChange(of: activeCategory) { _, newCategory in
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
        .sheet(isPresented: $showAirportList) {
            AirportPickerView(selectedAirport: tripsViewModel.selectedAirport) { airport in
                tripsViewModel.selectAirport(airport)
                cameraController.fly(to: tripsViewModel.initialRegion)
            }
        }
        .sheet(isPresented: $showTripsEventCard, onDismiss: {
            tripsViewModel.clearSelectionPublic()
        }) {
            SoccerEventSheet(viewModel: tripsViewModel)
        }
    }

    private var activeProvider: MapContentProvider {
        switch activeCategory {
        case .events: return mapViewModel
        case .trips: return tripsViewModel
        }
    }

    @ViewBuilder
    private var rightSlider: some View {
        switch activeCategory {
        case .events:
            if !mapViewModel.isLive {
                HStack {
                    Spacer()
                    DaySliderView(viewModel: mapViewModel)
                        .padding(.trailing, 10)
                }
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
        if activeCategory == .trips {
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
