import SwiftUI

enum AppTab: String, CaseIterable, Identifiable, Equatable {
    case map
    case list
    case profile

    var id: String { rawValue }
}

@Observable
@MainActor
final class AppRouter {
    var category: MapCategory = .events
    var activeTab: AppTab = .map
    var isShowingCityBreakSublist = false
    var listNavigationResetToken = 0
    var showStoryViewer = false
    var selectedStoryIndex = 0
    var storyPosts: [Post] = []

    func selectTab(_ tab: AppTab) {
        guard !(tab == .list && activeTab == .list) else {
            listNavigationResetToken += 1
            return
        }
        activeTab = tab
        guard tab != .list else { return }
        isShowingCityBreakSublist = false
    }

    func openStory(id: String, map: MapViewModel) async {
        selectTab(.map)
        guard let post = await map.ensurePost(id: id) else {
            ToastManager.shared.show("Błąd: Spróbuj ponownie")
            return
        }
        await present([post])
    }

    private func present(_ posts: [Post]) async {
        storyPosts = posts
        selectedStoryIndex = 0
        NotificationCenter.default.post(name: .scrollToPost, object: posts.first)
        try? await Task.sleep(nanoseconds: 700_000_000)
        showStoryViewer = true
    }
}
