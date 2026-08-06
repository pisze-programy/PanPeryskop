import SwiftUI
import MapKit

struct MapScreen: View {
    @ObservedObject var viewModel: MapViewModel
    @Binding var showStoryViewer: Bool
    @Binding var selectedStoryIndex: Int
    @Binding var storyPosts: [Post]
    @EnvironmentObject private var authManager: AuthManager

    @State private var showCityList = false

    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            MapKitMapView(
                zoom: viewModel.defaultZoom,
                posts: viewModel.posts,
                currentUserId: authManager.userId,
                initialRegion: viewModel.initialRegion,
                onRegionChange: { swLat, swLng, neLat, neLng in
                    viewModel.fetchStories(swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng)
                },
                onCameraSettled: { region in
                    viewModel.saveViewport(region)
                },
                onTapPost: { post, bbox in
                    guard !post.watched else { return }
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
        }
        .onAppear {
            viewModel.currentUserId = authManager.userId
            viewModel.startPolling()
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
