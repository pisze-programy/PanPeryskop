import SwiftUI
import MapKit

struct MapScreen: View {
    @ObservedObject var viewModel: MapViewModel
    @Binding var showStoryViewer: Bool
    @Binding var selectedStoryIndex: Int
    @EnvironmentObject private var authManager: AuthManager

    @State private var showReturnPill = false

    let poznanCenter = CLLocationCoordinate2D(latitude: 52.4064, longitude: 16.9252)
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
                onTapHeatCell: { cell in
                    viewModel.selectRegion(lat: cell.lat, lng: cell.lng)
                },
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
                    Text("Poznań")
                        .font(.headline)
                        .fontWeight(.semibold)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(.ultraThinMaterial)
                        .clipShape(Capsule())
                        .shadow(color: .black.opacity(0.15), radius: 8, x: 0, y: 3)
                        .padding(.top, 12)
                    Spacer()
                }
                .padding(.top, 12)

                StoriesBarView(
                    posts: viewModel.posts.filter { !PendingStore.shared.posts.map(\.id).contains($0.id) },
                    onTapStory: { index in
                        selectedStoryIndex = index
                        showStoryViewer = true
                    }
                )
                .padding(.top, 8)

                Spacer()

                if !viewModel.selectedRegionPosts.isEmpty {
                    RegionPostList(posts: viewModel.selectedRegionPosts, viewModel: viewModel)
                        .frame(height: 172)
                        .background(.ultraThinMaterial)
                        .transition(.move(edge: .bottom))
                }
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
            viewModel.fetchStories(swLat: 52.30, swLng: 16.80, neLat: 52.52, neLng: 17.05)
        }
    }
}

extension Notification.Name {
    static let returnToCenter = Notification.Name("returnToCenter")
    static let scrollToPost = Notification.Name("scrollToPost")
}

struct RegionPostList: View {
    let posts: [Post]
    @ObservedObject var viewModel: MapViewModel

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 10) {
                ForEach(posts) { post in
                    Button {
                        if let idx = viewModel.posts.firstIndex(where: { $0.id == post.id }) {
                            _ = idx
                        }
                    } label: {
                        RegionPostCard(post: post)
                    }
                }
            }
            .padding(.horizontal, 12)
        }
    }
}

struct RegionPostCard: View {
    let post: Post

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.secondary.opacity(0.3))
                .frame(width: 88, height: 156)
                .overlay {
                    if let url = post.resolvedThumbURL {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let image):
                                image.resizable().aspectRatio(contentMode: .fill)
                            case .empty:
                                ZStack {
                                    Color.secondary.opacity(0.2)
                                    ProgressView()
                                }
                            case .failure:
                                Color.secondary.opacity(0.2)
                            @unknown default:
                                Color.secondary.opacity(0.2)
                            }
                        }
                        .frame(width: 88, height: 156)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    } else {
                        Image(systemName: post.type == .text ? "doc.text.fill" : "photo.fill")
                            .font(.title2)
                            .foregroundColor(.secondary)
                    }
                }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Image(systemName: post.type == .video ? "video.fill" : "eye")
                        .font(.system(size: 8))
                    Text("\(post.views_count)")
                        .font(.system(size: 8))
                }
                Text(post.description)
                    .font(.system(size: 9))
                    .lineLimit(2)
                HStack(spacing: 6) {
                    Image(systemName: "heart")
                        .font(.system(size: 8))
                    Text("\(post.likes_count)")
                        .font(.system(size: 8))
                }
            }
            .foregroundColor(.white)
            .padding(6)
            .frame(maxWidth: 88, alignment: .leading)
            .background(LinearGradient(colors: [.black.opacity(0.7), .clear], startPoint: .bottom, endPoint: .top))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .frame(width: 88, height: 156)
    }
}
