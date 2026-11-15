import SwiftUI

@main
struct PanPeryskopApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var authManager = AuthManager()
    @StateObject private var regionStore = RegionStore.shared
    @State private var pendingStoryId: String?

    init() {
        URLCache.shared = URLCache(
            memoryCapacity: 32 * 1024 * 1024,
            diskCapacity: 150 * 1024 * 1024
        )
    }

    var body: some Scene {
        WindowGroup {
            rootView
                .environment(\.region, regionStore.current)
                .environmentObject(regionStore)
                .background(MeshGradientWarmup())
                .overlay(alignment: .bottom) {
                    debugBar
                }
                .onOpenURL(perform: handleOpenURL)
                .onChange(of: authManager.isAuthenticated) { _, isAuthenticated in
                    handleAuthChange(isAuthenticated)
                }
        }
    }

    @ViewBuilder
    private var rootView: some View {
        if authManager.isAuthenticated {
            ContentView(pendingStoryId: $pendingStoryId)
                .environmentObject(authManager)
        } else {
            OnboardingView(pendingStoryId: $pendingStoryId)
                .environmentObject(authManager)
        }
    }

    @ViewBuilder
    private var debugBar: some View {
        #if DEBUG
        DevelopmentModeBar()
        #endif
    }

    private func handleOpenURL(_ url: URL) {
        guard let id = DeepLink.storyId(from: url) else { return }
        pendingStoryId = id
    }

    private func handleAuthChange(_ isAuthenticated: Bool) {
        guard isAuthenticated, authManager.consumeJustRegistered() else { return }
        MetaSignals.registered()
        ProductAnalytics.registered()
    }
}

#if DEBUG
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
