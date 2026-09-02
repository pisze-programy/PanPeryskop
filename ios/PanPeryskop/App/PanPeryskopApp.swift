import SwiftUI
import UserNotifications

@main
struct PanPeryskopApp: App {
    @StateObject private var authManager = AuthManager()
    @State private var pendingStoryId: String?

    init() {
        UNUserNotificationCenter.current().delegate = NotificationDelegate.shared
    }

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
            .background(MeshGradientWarmup())
            .overlay(alignment: .bottom) {
                #if DEBUG
                DevelopmentModeBar()
                #endif
            }
            .onOpenURL { url in
                if let id = DeepLink.storyId(from: url) {
                    pendingStoryId = id
                }
            }
        }
    }
}

#if DEBUG
/// Full-width red DEV bar pinned to the bottom edge — DEBUG builds only, compiled
/// out of Release so it never ships to the store.
struct DevelopmentModeBar: View {
    var body: some View {
        Text("DEVELOPMENT MODE")
            .font(.caption2)
            .fontWeight(.semibold)
            .foregroundColor(.black)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 3)
            .background(Color.red)
            .allowsHitTesting(false)
            .ignoresSafeArea(edges: .bottom)
    }
}
#endif
