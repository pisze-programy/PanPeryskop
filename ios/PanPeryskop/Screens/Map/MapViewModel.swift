import SwiftUI
import CoreLocation
import Combine

@MainActor
class MapViewModel: ObservableObject {
    @Published var posts: [Post] = []
    @Published var isLoading = false
    @Published var selectedCity: City = .poznan

    private var serverPosts: [Post] = []
    private var pendingCancellable: AnyCancellable?
    var currentUserId: String?
    private var viewport: Viewport?
    private var knownPostIds: Set<String> = []
    private var pollingTask: Task<Void, Never>?
    private var isFetchingStories = false
    private var isRegionFetchPending = false
    private var isCityTransitionPending = false
    private var cityTransitionTask: Task<Void, Never>?

    private struct Viewport {
        let swLat: Double
        let swLng: Double
        let neLat: Double
        let neLng: Double
    }

    init() {
        pendingCancellable = PendingStore.shared.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.refreshPosts()
            }
    }

    var allPosts: [Post] {
        serverPosts + PendingStore.shared.posts
    }

    var defaultCenter: CLLocationCoordinate2D { selectedCity.center }
    var defaultZoom: Double { 12 }

    private func refreshPosts() {
        posts = allPosts
    }

    private var debounceTask: Task<Void, Never>?

    func selectCity(_ city: City) {
        selectedCity = city
        let region = city.region
        let swLat = region.center.latitude - region.span.latitudeDelta / 2
        let swLng = region.center.longitude - region.span.longitudeDelta / 2
        let neLat = region.center.latitude + region.span.latitudeDelta / 2
        let neLng = region.center.longitude + region.span.longitudeDelta / 2
        fetchStories(swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng)
        startCityTransition()
    }

    private func startCityTransition() {
        isCityTransitionPending = true
        cityTransitionTask?.cancel()
        cityTransitionTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            guard !Task.isCancelled else { return }
            self?.isCityTransitionPending = false
        }
    }

    func fetchStories(swLat: Double, swLng: Double, neLat: Double, neLng: Double) {
        viewport = Viewport(swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng)
        isRegionFetchPending = true
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled else { return }
            if let fetched = await loadStories(swLat: swLat, swLng: swLng, neLat: neLat, neLng: neLng) {
                knownPostIds = Set(fetched.map(\.id))
            }
            isRegionFetchPending = false
        }
    }

    @discardableResult
    private func loadStories(swLat: Double, swLng: Double, neLat: Double, neLng: Double) async -> [Post]? {
        guard !isFetchingStories else { return nil }
        isFetchingStories = true
        defer { isFetchingStories = false }
        let params = [
            "sw_lat": String(swLat),
            "sw_lng": String(swLng),
            "ne_lat": String(neLat),
            "ne_lng": String(neLng),
        ]
        do {
            let resp: PostListResponse = try await APIClient.get("/stories", params: params)
            let fetched = resp.stories.filter { $0.type != .text }
            serverPosts = fetched
            posts = allPosts
            return fetched
        } catch {
            print("Failed to load stories:", error)
            return nil
        }
    }

    private static let pollInterval: UInt64 = 20_000_000_000

    func startPolling() {
        stopPolling()
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: Self.pollInterval)
                guard !Task.isCancelled else { return }
                guard let self else { return }
                await self.pollStories()
            }
        }
    }

    func stopPolling() {
        pollingTask?.cancel()
        pollingTask = nil
    }

    private func pollStories() async {
        guard let viewport, !isRegionFetchPending, !isCityTransitionPending else { return }
        guard let fetched = await loadStories(
            swLat: viewport.swLat, swLng: viewport.swLng,
            neLat: viewport.neLat, neLng: viewport.neLng
        ) else { return }
        guard !Task.isCancelled else { return }
        let pendingIds = Set(PendingStore.shared.posts.map(\.id))
        let hasNew = fetched.contains {
            !knownPostIds.contains($0.id)
                && !pendingIds.contains($0.id)
                && $0.user_id != currentUserId
        }
        knownPostIds.formUnion(fetched.map(\.id))
        if hasNew {
            ToastManager.shared.show("Nowe!")
        }
    }

    func viewerPosts(for clicked: Post) -> [Post] {
        [clicked] + posts.filter { $0.id != clicked.id && !$0.watched }
    }

    func viewerPosts(forCluster clusterPosts: [Post]) -> [Post] {
        let clusterIds = Set(clusterPosts.map(\.id))
        return clusterPosts.filter { !$0.watched } + posts.filter { !clusterIds.contains($0.id) && !$0.watched }
    }

    func markWatched(_ postId: String) async {
        let isPending = PendingStore.shared.posts.map(\.id).contains(postId)
        if isPending { return }
        do {
            try await APIClient.postEmpty("/actions/\(postId)/watched")
            if let idx = serverPosts.firstIndex(where: { $0.id == postId }) {
                serverPosts[idx] = withWatched(true, serverPosts[idx])
                posts = allPosts
            }
        } catch {
            print("Failed to mark watched:", error)
        }
    }

    private func withWatched(_ watched: Bool, _ post: Post) -> Post {
        Post(
            id: post.id, user_id: post.user_id, type: post.type,
            lat: post.lat, lng: post.lng, description: post.description,
            media_key: post.media_key, thumb_key: post.thumb_key,
            created_at: post.created_at, expires_at: post.expires_at,
            likes_count: post.likes_count, views_count: post.views_count, shares_count: post.shares_count,
            grid_cell_id: post.grid_cell_id,
            liked: post.liked, watched: watched,
            author_name: post.author_name, media_url: post.media_url, thumb_url: post.thumb_url,
            author_avatar_url: post.author_avatar_url
        )
    }

    func toggleLike(_ postId: String) async -> Bool {
        do {
            struct LikeResp: Codable { let liked: Bool }
            let resp: LikeResp = try await APIClient.postEmptyBody("/actions/\(postId)/like")
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
                    author_name: updated.author_name, media_url: updated.media_url, thumb_url: updated.thumb_url,
                    author_avatar_url: updated.author_avatar_url
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

    func ensurePost(id: String) async -> Post? {
        if let existing = posts.first(where: { $0.id == id }) {
            return existing
        }
        do {
            let post: Post = try await APIClient.get("/posts/\(id)")
            serverPosts.append(post)
            posts = allPosts
            return post
        } catch {
            print("Failed to fetch post \(id):", error)
            return nil
        }
    }
}
