import SwiftUI

/// Bottom-anchored dark gradient for the onboarding. Keeps the top of the video
/// clean and darkens the lower part so the copy and the sign-in button stay legible.
struct OnboardingGradient: View {
    var body: some View {
        LinearGradient(
            stops: [
                .init(color: .clear, location: 0.0),
                .init(color: .clear, location: 0.30),
                .init(color: .black.opacity(0.35), location: 0.55),
                .init(color: .black.opacity(0.80), location: 0.85),
                .init(color: .black.opacity(0.92), location: 1.0),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }
}
