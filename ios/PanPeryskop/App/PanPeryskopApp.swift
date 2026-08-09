import SwiftUI
import GoogleSignIn
import UserNotifications
import BackgroundTasks

@main
struct PanPeryskopApp: App {
    @StateObject private var authManager = AuthManager()
    @State private var pendingStoryId: String?

    private static let mediaRefreshTaskID = "com.panperyskop.refresh.media"

    init() {
        UNUserNotificationCenter.current().delegate = NotificationDelegate.shared
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.mediaRefreshTaskID, using: nil) { task in
            Self.handleMediaRefresh(task: task)
        }
        Self.scheduleMediaRefresh()
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
            .onOpenURL { url in
                GIDSignIn.sharedInstance.handle(url)
                if let id = DeepLink.storyId(from: url) {
                    pendingStoryId = id
                }
            }
        }
    }

    // MARK: - Background media refresh (~1/h, best-effort)

    private static func scheduleMediaRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: mediaRefreshTaskID)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 3_600)
        try? BGTaskScheduler.shared.submit(request)
    }

    private static func handleMediaRefresh(task: BGTask) {
        scheduleMediaRefresh()
        let handler = Task { @MainActor in
            await MediaNearbyNotifier.shared.pollBackground()
            task.setTaskCompleted(success: true)
        }
        task.expirationHandler = {
            handler.cancel()
            task.setTaskCompleted(success: false)
        }
    }
}
