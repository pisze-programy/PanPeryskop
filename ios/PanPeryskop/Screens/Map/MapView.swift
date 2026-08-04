import SwiftUI
import MapKit

struct MapScreen: View {
    @ObservedObject var viewModel: MapViewModel
    @Binding var showStoryViewer: Bool
    @Binding var selectedStoryIndex: Int
    @EnvironmentObject private var authManager: AuthManager

    @State private var showReturnPill = false
    @State private var showCityList = false

    let centerThreshold: Double = 0.025

    var body: some View {
        ZStack {
            MapKitMapView(
                center: viewModel.defaultCenter,
                zoom: viewModel.defaultZoom,
                heatmapCells: viewModel.heatmapCells,
                posts: viewModel.posts,
                pendingIds: Set(PendingStore.shared.posts.map(\.id)),
                currentUserId: authManager.userId,
                showReturnPill: $showReturnPill,
                centerThreshold: centerThreshold,
                onRegionChange: { swLat, swLng, neLat, neLng in
                    viewModel.fetchStories(swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng)
                },
                onTapHeatCell: { _ in },
                onTapPost: { post in
                    if let idx = viewModel.posts.firstIndex(where: { $0.id == post.id }) {
                        selectedStoryIndex = idx
                        showStoryViewer = true
                    }
                }
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Button {
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

                StoriesBarView(
                    posts: viewModel.posts.filter {
                        !PendingStore.shared.posts.map(\.id).contains($0.id)
                    },
                    onTapStory: { index in
                        selectedStoryIndex = index
                        showStoryViewer = true
                    }
                )
                .padding(.top, 8)

                Spacer()
            }

            if showReturnPill {
                VStack {
                    Spacer()
                    Button {
                        withAnimation { showReturnPill = false }
                        NotificationCenter.default.post(name: .returnToCenter, object: nil)
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "location.fill")
                                .font(.caption)
                            Text("Wróć do centrum")
                                .font(.subheadline)
                                .fontWeight(.medium)
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                        .background(.ultraThinMaterial)
                        .clipShape(Capsule())
                        .shadow(radius: 4)
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .padding(.bottom, 120)
                }
            }
        }
        .onAppear {
            let region = viewModel.selectedCity.region
            viewModel.fetchStories(
                swLat: region.center.latitude - region.span.latitudeDelta / 2,
                swLng: region.center.longitude - region.span.longitudeDelta / 2,
                neLat: region.center.latitude + region.span.latitudeDelta / 2,
                neLng: region.center.longitude + region.span.longitudeDelta / 2
            )
        }
        .sheet(isPresented: $showCityList) {
            CityListView(selectedCity: viewModel.selectedCity) { city in
                viewModel.selectCity(city)
                NotificationCenter.default.post(name: .flyToCity, object: city)
            }
        }
    }
}

extension Notification.Name {
    static let returnToCenter = Notification.Name("returnToCenter")
    static let flyToCity = Notification.Name("flyToCity")
    static let scrollToPost = Notification.Name("scrollToPost")
}
