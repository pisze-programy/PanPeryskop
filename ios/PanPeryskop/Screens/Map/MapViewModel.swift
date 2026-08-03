import SwiftUI
import CoreLocation

@MainActor
class MapViewModel: ObservableObject {
    @Published var posts: [Post] = []
    @Published var heatmapCells: [GridCell] = []
    @Published var selectedRegionPosts: [Post] = []
    @Published var isLoading = false

    let defaultCenter = CLLocationCoordinate2D(latitude: 52.4064, longitude: 16.9252)
    let defaultZoom: Double = 12

    private var debounceTask: Task<Void, Never>?

    func fetchStories(swLat: Double, swLng: Double, neLat: Double, neLng: Double) {
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled else { return }
            await loadStories(swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng)
            await loadHeatmap(swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng)
        }
    }

    private func loadStories(swLat: Double, swLng: Double, neLat: Double, neLng: Double) async {
        let params = [
            "sw_lat": String(swLat),
            "sw_lng": String(swLng),
            "ne_lat": String(neLat),
            "ne_lng": String(neLng),
        ]
        do {
            let resp: PostListResponse = try await APIClient.get("/stories", params: params)
            posts = resp.stories
        } catch {
            print("Failed to load stories:", error)
        }
    }

    private func loadHeatmap(swLat: Double, swLng: Double, neLat: Double, neLng: Double) async {
        let params = [
            "sw_lat": String(swLat),
            "sw_lng": String(swLng),
            "ne_lat": String(neLat),
            "ne_lng": String(neLng),
        ]
        do {
            let cells: [GridCell] = try await APIClient.get("/stories/heatmap", params: params)
            heatmapCells = cells
        } catch {
            print("Failed to load heatmap:", error)
        }
    }

    func selectRegion(lat: Double, lng: Double) {
        selectedRegionPosts = posts.filter { post in
            abs(post.lat - lat) < 0.0005 && abs(post.lng - lng) < 0.0005
        }
    }

    func markWatched(_ postId: String) async {
        do {
            try await APIClient.postEmpty("/actions/\(postId)/watched")
            posts.removeAll { $0.id == postId }
            selectedRegionPosts.removeAll { $0.id == postId }
        } catch {
            print("Failed to mark watched:", error)
        }
    }

    func toggleLike(_ postId: String) async -> Bool {
        do {
            struct LikeResp: Codable { let liked: Bool }
            let resp: LikeResp = try await APIClient.post("/actions/\(postId)/like", body: EmptyBody())
            if let idx = posts.firstIndex(where: { $0.id == postId }) {
                var updated = posts[idx]
                updated = Post(
                    id: updated.id, user_id: updated.user_id, type: updated.type,
                    lat: updated.lat, lng: updated.lng, description: updated.description,
                    media_key: updated.media_key, thumb_key: updated.thumb_key,
                    created_at: updated.created_at, expires_at: updated.expires_at,
                    likes_count: resp.liked ? updated.likes_count + 1 : max(0, updated.likes_count - 1),
                    views_count: updated.views_count, shares_count: updated.shares_count,
                    grid_cell_id: updated.grid_cell_id,
                    liked: resp.liked, watched: updated.watched,
                    author_name: updated.author_name, media_url: updated.media_url, thumb_url: updated.thumb_url
                )
                posts[idx] = updated
            }
            return resp.liked
        } catch {
            print("Failed to toggle like:", error)
            return false
        }
    }

    func sharePost(_ postId: String) async {
        do {
            try await APIClient.postEmpty("/actions/\(postId)/share")
        } catch {
            print("Failed to share:", error)
        }
    }
}

struct EmptyBody: Codable {}
