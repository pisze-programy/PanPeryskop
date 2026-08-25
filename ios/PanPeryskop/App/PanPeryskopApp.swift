import SwiftUI
import UserNotifications
import BackgroundTasks

@main
struct PanPeryskopApp: App {
    @StateObject private var authManager = AuthManager()
    @State private var pendingStoryId: String?

    private static let mediaRefreshTaskID = "com.panperyskop.refresh.media"

    init() {
        UNUserNotificationCenter.current().delegate = NotificationDelegate.shared
        // BGTaskScheduler invokes the handler on a BACKGROUND queue — the closure
        // must not be @MainActor-isolated (Swift 6 traps with
        // _swift_task_checkIsolatedSwift → EXC_BREAKPOINT). Hop to the main actor.
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.mediaRefreshTaskID, using: nil) { task in
            Task { @MainActor in Self.handleMediaRefresh(task: task) }
        }
        Self.scheduleMediaRefresh()
        ProximityMonitor.shared.rehydrate()
        NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { _ in
            Task { @MainActor in
                Self.scheduleMediaRefresh()
            }
        }
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

    // MARK: - Background media refresh (~1/h, best-effort)

    private static func scheduleMediaRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: mediaRefreshTaskID)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 3_600)
        try? BGTaskScheduler.shared.submit(request)
    }

    private static func handleMediaRefresh(task: BGTask) {
        scheduleMediaRefresh()
        let handler = Task { @MainActor in
            ProximityMonitor.shared.rehydrate()
            await MediaNearbyNotifier.shared.pollBackground()
            task.setTaskCompleted(success: true)
        }
        task.expirationHandler = {
            handler.cancel()
            task.setTaskCompleted(success: false)
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
