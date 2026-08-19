import SwiftUI
import MapKit

struct MapScreen: View {
    @ObservedObject var viewModel: MapViewModel
    @Binding var showStoryViewer: Bool
    @Binding var selectedStoryIndex: Int
    @Binding var storyPosts: [Post]
    @EnvironmentObject private var authManager: AuthManager

    @State private var showCityList = false
    @State private var previewRequestPin: CLLocationCoordinate2D?
    @State private var pendingRequestDrop: CLLocationCoordinate2D?
    @State private var showRequestConfirmAlert = false
    @State private var showRequestCooldownAlert = false
    @State private var requestCooldownMinutes = 0

    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            MapKitMapView(
                zoom: viewModel.defaultZoom,
                posts: viewModel.posts,
                mediaRequests: viewModel.mediaRequests,
                previewRequestPin: previewRequestPin,
                currentUserId: authManager.userId,
                initialRegion: viewModel.initialRegion,
                onRegionChange: { swLat, swLng, neLat, neLng in
                    viewModel.fetchStories(swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng)
                },
                onCameraSettled: { region in
                    viewModel.saveViewport(region)
                },
                onTapPost: { post, bbox in
                    guard !post.watched || post.isEvent else { return }
                    Haptics.impact(.medium)
                    storyPosts = viewModel.viewerPosts(for: post, in: bbox)
                    selectedStoryIndex = 0
                    showStoryViewer = true
                },
                onTapCluster: { cluster, bbox in
                    Haptics.impact(.medium)
                    storyPosts = viewModel.viewerPosts(forCluster: cluster.posts, in: bbox)
                    selectedStoryIndex = 0
                    showStoryViewer = true
                },
                onRequestPinDrop: { coordinate in
                    handleRequestPinDrop(coordinate)
                }
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Button {
                        Haptics.selection()
                        showCityList = true
                    } label: {
                        HStack(spacing: 6) {
                            Text(viewModel.selectedCity.name)
                                .font(.headline)
                                .fontWeight(.semibold)
                            Image(systemName: "chevron.down")
                                .font(.caption2.weight(.semibold))
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(.ultraThinMaterial)
                        .clipShape(Capsule())
                        .shadow(color: .black.opacity(0.15), radius: 8, x: 0, y: 3)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 12)
                    Spacer()
                }
                .padding(.top, 12)

                Spacer()
            }

            VStack {
                Spacer()
                categoryPill
                    .padding(.bottom, 112)
            }

            if viewModel.feedCategory == .events {
                HStack {
                    Spacer()
                    DaySliderView(viewModel: viewModel)
                        .padding(.trailing, 10)
                }
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.82), value: viewModel.feedCategory)
        .onAppear {
            viewModel.currentUserId = authManager.userId
            viewModel.startPolling()
            viewModel.runMediaNearbyCheck()
            ProximityMonitor.shared.requestNotificationPermissionIfNeeded()
            let region = viewModel.initialRegion
            viewModel.fetchStories(
                swLat: region.center.latitude - region.span.latitudeDelta / 2,
                swLng: region.center.longitude - region.span.longitudeDelta / 2,
                neLat: region.center.latitude + region.span.latitudeDelta / 2,
                neLng: region.center.longitude + region.span.longitudeDelta / 2
            )
        }
        .onDisappear {
            viewModel.stopPolling()
        }
        .onChange(of: authManager.userId) { _, newValue in
            viewModel.currentUserId = newValue
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                viewModel.startPolling()
            } else {
                viewModel.stopPolling()
            }
        }
        .sheet(isPresented: $showCityList) {
            CityListView(selectedCity: viewModel.selectedCity) { city in
                viewModel.selectCity(city)
                NotificationCenter.default.post(name: .flyToCity, object: city)
            }
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

    private var cooldownMessage: String {
        if requestCooldownMinutes == 1 {
            return "Dodałeś już pin zapytania. Możesz dodać kolejny za 1 minutę."
        }
        return "Dodałeś już pin zapytania. Możesz dodać kolejny za \(requestCooldownMinutes) min."
    }

    private func handleRequestPinDrop(_ coordinate: CLLocationCoordinate2D) {
        guard viewModel.feedCategory == .live else { return }
        guard isSpotsEmpty(at: coordinate) else { return }
        Haptics.explosion()
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            previewRequestPin = coordinate
        }
        let cooldown = viewModel.requestCooldownSeconds()
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
            let result = await viewModel.submitRequestPin(at: coordinate)
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

    /// Long-press drops a request pin only on "empty" map — not over a media pin/cluster
    /// nor over an existing request pin.
    private func isSpotsEmpty(at coordinate: CLLocationCoordinate2D) -> Bool {
        let tooClose = viewModel.posts.contains { post in
            dist(post.lat, post.lng, coordinate.latitude, coordinate.longitude) < 0.0008
        }
        let tooCloseRequest = viewModel.mediaRequests.contains { request in
            dist(request.lat, request.lng, coordinate.latitude, coordinate.longitude) < 0.0008
        }
        return !tooClose && !tooCloseRequest
    }

    private func dist(_ lat1: Double, _ lng1: Double, _ lat2: Double, _ lng2: Double) -> Double {
        let dlat = lat1 - lat2
        let dlng = lng1 - lng2
        return sqrt(dlat * dlat + dlng * dlng)
    }

    private var categoryPill: some View {
        HStack(spacing: 4) {
            ForEach(FeedCategory.allCases) { cat in
                Button {
                    guard viewModel.feedCategory != cat else { return }
                    Haptics.selection()
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) {
                        viewModel.selectFeedCategory(cat)
                    }
                } label: {
                    Text(cat.label)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.primary)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background {
                            if viewModel.feedCategory == cat {
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
    static let flyToCity = Notification.Name("flyToCity")
    static let scrollToPost = Notification.Name("scrollToPost")
}
