import SwiftUI

/// App-level navigation/presentation state (category, profile, story viewer).
@Observable
@MainActor
final class AppRouter {
    var category: MapCategory = .events
    var showProfile = false
    var showStoryViewer = false
    var selectedStoryIndex = 0
    var storyPosts: [Post] = []

    func openStory(id: String, map: MapViewModel) async {
        showProfile = false
        guard let post = await map.ensurePost(id: id) else {
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
