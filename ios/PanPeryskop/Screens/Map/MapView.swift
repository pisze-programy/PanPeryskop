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
    @State private var previewRequestPin: CLLocationCoordinate2D?
    @State private var pendingRequestDrop: CLLocationCoordinate2D?
    @State private var showRequestConfirmAlert = false
    @State private var showRequestCooldownAlert = false
    @State private var requestCooldownMinutes = 0

    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            MapKitMapView(
                overlays: activeProvider.overlays,
                previewRequestPin: previewRequestPin,
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
                onRequestPinDrop: { coordinate in
                    handleRequestPinDrop(coordinate)
                },
                cameraController: cameraController
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        switch activeCategory {
                        case .events, .live:
                            cityButton
                            if activeCategory == .events {
                                allChip
                                    .padding(.leading, 10)
                                ForEach(mapViewModel.sortedTags) { tag in
                                    tagChip(tag)
                                }
                            }
                        case .trips:
                            airportButton
                                .padding(.leading, 10)
                            ForEach(TripsViewModel.TravelTag.allCases) { tag in
                                travelTagChip(tag)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 6)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Spacer()
            }

            VStack {
                Spacer()
                categoryPill
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
            case .events, .live:
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
            EventCardView(viewModel: tripsViewModel)
        }
        .alert("Co tu się dzieje?", isPresented: $showRequestConfirmAlert) {
            Button("Tak") { confirmRequestDrop() }
            Button("Anuluj", role: .cancel) { clearPreviewRequestPin() }
        } message: {
            Text("Chcesz poprosić innych o udostępnienie Live w okolicy?")
        }
        .alert("Następny pin za chwilę", isPresented: $showRequestCooldownAlert) {
            Button("OK", role: .cancel) { clearPreviewRequestPin() }
        } message: {
            Text(cooldownMessage)
        }
    }

    private var activeProvider: MapContentProvider {
        switch activeCategory {
        case .events, .live: return mapViewModel
        case .trips: return tripsViewModel
        }
    }

    @ViewBuilder
    private var rightSlider: some View {
        switch activeCategory {
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
        case .live:
            EmptyView()
        }
    }

    private var cooldownMessage: String {
        if requestCooldownMinutes == 1 {
            return "Dodałeś już pin zapytania. Możesz dodać kolejny za 1 minutę."
        }
        return "Dodałeś już pin zapytania. Możesz dodać kolejny za \(requestCooldownMinutes) min."
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
        guard !post.watched || post.isEvent else { return }
        Haptics.impact(.medium)
        storyPosts = pin.group.isEmpty ? [post] : pin.group
        selectedStoryIndex = 0
        showStoryViewer = true
    }

    private func handleRequestPinDrop(_ coordinate: CLLocationCoordinate2D) {
        guard activeCategory == .live else { return }
        guard isSpotsEmpty(at: coordinate) else { return }
        Haptics.explosion()
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            previewRequestPin = coordinate
        }
        let cooldown = mapViewModel.requestCooldownSeconds()
        if cooldown > 0 {
            requestCooldownMinutes = max(1, Int(ceil(cooldown / 60)))
            showRequestCooldownAlert = true
        } else {
            pendingRequestDrop = coordinate
            showRequestConfirmAlert = true
        }
    }

    private func confirmRequestDrop() {
        guard let coordinate = pendingRequestDrop else {
            clearPreviewRequestPin()
            return
        }
        pendingRequestDrop = nil
        ProximityMonitor.shared.requestNotificationPermissionIfNeeded()
        Task {
            let result = await mapViewModel.submitRequestPin(at: coordinate)
            switch result {
            case .success:
                Haptics.success()
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    previewRequestPin = nil
                }
            case .cooldown(let minutes):
                Haptics.error()
                requestCooldownMinutes = max(1, minutes)
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    previewRequestPin = nil
                }
                showRequestCooldownAlert = true
            case .failure:
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    previewRequestPin = nil
                }
                ToastManager.shared.show("Coś poszło nie tak. Spróbuj ponownie.")
            }
        }
    }

    private func clearPreviewRequestPin() {
        pendingRequestDrop = nil
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            previewRequestPin = nil
        }
    }

    private func isSpotsEmpty(at coordinate: CLLocationCoordinate2D) -> Bool {
        let tooClose = mapViewModel.posts.contains { post in
            dist(post.lat, post.lng, coordinate.latitude, coordinate.longitude) < 0.0008
        }
        let tooCloseRequest = mapViewModel.mediaRequests.contains { request in
            dist(request.lat, request.lng, coordinate.latitude, coordinate.longitude) < 0.0008
        }
        return !tooClose && !tooCloseRequest
    }

    private func dist(_ lat1: Double, _ lng1: Double, _ lat2: Double, _ lng2: Double) -> Double {
        let dlat = lat1 - lat2
        let dlng = lng1 - lng2
        return sqrt(dlat * dlat + dlng * dlng)
    }

    /// City navigation pill — independent of the tag filter (just flies to the city).
    private var cityButton: some View {
        Button {
            Haptics.selection()
            showCityList = true
        } label: {
            HStack(spacing: 6) {
                Text(mapViewModel.selectedCity.name)
                    .font(.headline)
                    .fontWeight(.semibold)
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.semibold))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().stroke(Color.white.opacity(0.2), lineWidth: 1))
            .shadow(color: .black.opacity(0.15), radius: 8, x: 0, y: 3)
        }
        .buttonStyle(.plain)
    }

    /// Airport pill (Wycieczki) — opens the Polish airport picker.
    private var airportButton: some View {
        Button {
            Haptics.selection()
            showAirportList = true
        } label: {
            HStack(spacing: 6) {
                Text("\(tripsViewModel.selectedAirport.iata) · \(tripsViewModel.selectedAirport.city)")
                    .font(.headline)
                    .fontWeight(.semibold)
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.semibold))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().stroke(Color.white.opacity(0.2), lineWidth: 1))
            .shadow(color: .black.opacity(0.15), radius: 8, x: 0, y: 3)
        }
        .buttonStyle(.plain)
    }

    private func chipButton(_ label: String, isSelected: Bool, badgeCount: Int = 0, showEmptyBadge: Bool = false, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.selection()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                action()
            }
        } label: {
            Text(label)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(isSelected ? .accentColor : .primary)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Capsule().fill(.ultraThinMaterial))
                .overlay(Capsule().fill(isSelected ? Color.accentColor.opacity(0.25) : .clear))
                .overlay(Capsule().stroke(isSelected ? Color.accentColor : Color.white.opacity(0.2), lineWidth: isSelected ? 1.5 : 1))
                .shadow(color: .black.opacity(0.15), radius: 8, x: 0, y: 3)
                .overlay(alignment: .topTrailing) {
                    if badgeCount > 0 || showEmptyBadge {
                        Text("\(badgeCount)")
                            .font(.caption2.bold())
                            .foregroundColor(.white)
                            .padding(.horizontal, 5)
                            .frame(minWidth: 16, minHeight: 16)
                            .background(Capsule().fill(Color.accentColor))
                            .overlay(Capsule().stroke(Color.white.opacity(0.3), lineWidth: 0.5))
                            .offset(x: 6, y: -6)
                            .transition(.scale.combined(with: .opacity))
                    }
                }
        }
        .buttonStyle(.plain)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: badgeCount)
    }

    private var allChip: some View {
        chipButton("Wszystkie", isSelected: mapViewModel.selectedTag == nil, badgeCount: mapViewModel.tagTotalCount, showEmptyBadge: true) {
            mapViewModel.selectAll()
        }
    }

    private func tagChip(_ tag: TagPill) -> some View {
        chipButton(tag.label, isSelected: mapViewModel.selectedTag == tag.id, badgeCount: mapViewModel.tagCounts[tag.id] ?? 0, showEmptyBadge: true) {
            mapViewModel.toggleTag(tag.id)
        }
    }

    private func travelTagChip(_ tag: TripsViewModel.TravelTag) -> some View {
        chipButton(tag.label, isSelected: tripsViewModel.selectedTag == tag) {
            tripsViewModel.selectTag(tripsViewModel.selectedTag == tag ? nil : tag)
        }
    }

    private var categoryPill: some View {
        HStack(spacing: 4) {
            ForEach(MapCategory.visibleCases) { cat in
                Button {
                    guard activeCategory != cat else { return }
                    Haptics.selection()
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) {
                        activeCategory = cat
                    }
                } label: {
                    Text(cat.label)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.primary)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background {
                            if activeCategory == cat {
                                Capsule()
                                    .fill(Color(.systemGray5))
                                    .shadow(color: .black.opacity(0.2), radius: 4, x: 0, y: 2)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.2), lineWidth: 1))
        .shadow(color: .black.opacity(0.15), radius: 10, x: 0, y: 4)
    }
}

extension Notification.Name {
    static let scrollToPost = Notification.Name("scrollToPost")
    static let didCaptureMedia = Notification.Name("didCaptureMedia")
}