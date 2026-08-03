import SwiftUI
import MapLibre

struct MapScreen: View {
    @StateObject private var viewModel = MapViewModel()
    @State private var showStoryViewer = false
    @State private var selectedStoryIndex = 0

    var body: some View {
        ZStack {
            MapLibreView(
                center: viewModel.defaultCenter,
                zoom: viewModel.defaultZoom,
                heatmapCells: viewModel.heatmapCells,
                onRegionChange: { swLat, swLng, neLat, neLng in
                    viewModel.fetchStories(swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng)
                },
                onTapHeatCell: { cell in
                    viewModel.selectRegion(lat: cell.lat, lng: cell.lng)
                }
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                StoriesBarView(
                    posts: viewModel.posts,
                    onTapStory: { index in
                        selectedStoryIndex = index
                        showStoryViewer = true
                    }
                )
                .padding(.top, 60)

                Spacer()

                if !viewModel.selectedRegionPosts.isEmpty {
                    RegionPostList(posts: viewModel.selectedRegionPosts, viewModel: viewModel)
                        .frame(height: 120)
                        .background(.ultraThinMaterial)
                        .transition(.move(edge: .bottom))
                }
            }

            if showStoryViewer {
                StoryFullScreenView(
                    posts: viewModel.posts,
                    startIndex: selectedStoryIndex,
                    isPresented: $showStoryViewer,
                    viewModel: viewModel
                )
                .transition(.opacity)
                .zIndex(20)
            }
        }
        .onAppear {
            viewModel.fetchStories(
                swLat: 52.30, swLng: 16.80,
                neLat: 52.52, neLng: 17.05
            )
        }
    }
}

struct RegionPostList: View {
    let posts: [Post]
    @ObservedObject var viewModel: MapViewModel

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(posts) { post in
                    Button {
                        if let idx = viewModel.posts.firstIndex(where: { $0.id == post.id }) {
                            _ = idx
                        }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(post.type.rawValue.capitalized)
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundColor(.accentColor)
                            Text(post.description)
                                .font(.caption)
                                .lineLimit(2)
                                .foregroundColor(.primary)
                            HStack(spacing: 8) {
                                Label("\(post.views_count)", systemImage: "eye")
                                Label("\(post.likes_count)", systemImage: "heart")
                            }
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        }
                        .padding(8)
                        .frame(width: 140)
                        .background(.regularMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
            }
            .padding(.horizontal, 12)
        }
    }
}
