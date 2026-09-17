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

    /// A "new media nearby" push tap: show the events feed and zoom to the post
    /// location — no story, no fetch (the coordinate comes from the notification).
    func openPushPost(_ payload: PushPostPayload, map: MapViewModel) async {
        showProfile = false
        category = .events
        map.selectFeedCategory(.events)
        NotificationCenter.default.post(
            name: .centerMapOnCoordinate,
            object: MapCenterPayload(lat: payload.lat, lng: payload.lng, zoomIn: true)
        )
    }

    private func present(_ posts: [Post], map: MapViewModel) async {
        storyPosts = posts
        selectedStoryIndex = 0
        NotificationCenter.default.post(name: .scrollToPost, object: posts.first)
        try? await Task.sleep(nanoseconds: 700_000_000)
        showStoryViewer = true
    }
}
