import SwiftUI

@main
struct PanPeryskopApp: App {
    @StateObject private var authManager = AuthManager()

    var body: some Scene {
        WindowGroup {
            if authManager.isAuthenticated {
                ContentView()
                    .environmentObject(authManager)
            } else {
                OnboardingView()
                    .environmentObject(authManager)
            }
        }
    }
}
