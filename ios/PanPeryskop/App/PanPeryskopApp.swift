import SwiftUI

@main
struct PanPeryskopApp: App {
    @StateObject private var authManager = AuthManager()
    @State private var pendingStoryId: String?

    var body: some Scene {
        WindowGroup {
            Group {
                if authManager.isAuthenticated {
                    ContentView(pendingStoryId: $pendingStoryId)
                        .environmentObject(authManager)
                } else {
                    OnboardingView(pendingStoryId: $pendingStoryId)
                        .environmentObject(authManager)
                }
            }
            .onOpenURL { url in
                if let id = DeepLink.storyId(from: url) {
                    pendingStoryId = id
                }
            }
        }
    }
}
