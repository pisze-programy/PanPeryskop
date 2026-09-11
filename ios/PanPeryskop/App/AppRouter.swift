import SwiftUI

/// App-level navigation/presentation state (tabs, add-content sheet, story viewer).
@Observable
@MainActor
final class AppRouter {
    var selectedTab = 0
    var showAddContent = false
    var showStoryViewer = false
    var selectedStoryIndex = 0
    var storyPosts: [Post] = []

    func openStory(id: String, map: MapViewModel) async {
        selectedTab = 0
        guard let post = await map.ensurePost(id: id) else {
            ToastManager.shared.show("Błąd: Spróbuj ponownie")
            return
        }
        await present([post], map: map)
    }

    /// Opens a post from a "new media nearby" push tap: switch the map to the post's
    /// category (so its pin is visible), center + zoom, then open the story preview.
    func openPushPost(_ payload: PushPostPayload, map: MapViewModel) async {
        selectedTab = 0
        map.selectFeedCategory(MapCategory(rawValue: payload.category) ?? .events)
        guard let post = await map.ensurePost(id: payload.postId) else {
            ToastManager.shared.show("Błąd: Spróbuj ponownie")
            return
        }
        await present([post], map: map)
    }

    private func present(_ posts: [Post], map: MapViewModel) async {
        storyPosts = posts
        selectedStoryIndex = 0
        NotificationCenter.default.post(name: .scrollToPost, object: posts.first)
        try? await Task.sleep(nanoseconds: 700_000_000)
        showStoryViewer = true
    }
}