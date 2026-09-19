import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Binding var pendingStoryId: String?
    @State private var isLoading = false
    @State private var errorMessage: String?

    private static let logoSize: CGFloat = 26
    private static let buttonHeight: CGFloat = 54
    private static let backgroundResource = "onboarding-background"

    var body: some View {
        ZStack {
            background
            OnboardingGradient()
            content
        }
    }

    private var background: some View {
        Group {
            if reduceMotion {
                Color.black
            } else {
                OnboardingVideoBackground(resource: Self.backgroundResource)
            }
        }
        .ignoresSafeArea()
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer()
            brand
            headline
            subheadline
            signIn
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.bottom, Theme.Spacing.xxl)
    }

    private var brand: some View {
        HStack(spacing: Theme.Spacing.s) {
            Image("Logo")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: Self.logoSize, height: Self.logoSize)
                .clipShape(Circle())
            Text("Pan Peryskop")
                .font(.headline)
                .foregroundColor(.white)
        }
        .padding(.bottom, Theme.Spacing.l)
    }

    private var headline: some View {
        Text("Jedna mapa")
            .font(.system(size: 34, weight: .bold))
            .foregroundColor(.white)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, Theme.Spacing.m)
    }

    private var subheadline: some View {
        Text("Wydarzenia lokalne i w Europie — loty, noclegi w zasięgu wzroku, bez szukania.")
            .font(.system(size: 17))
            .foregroundColor(.white.opacity(0.8))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, Theme.Spacing.xl)
    }

    private var signIn: some View {
        VStack(spacing: Theme.Spacing.m) {
            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            AppleSignInButton(
                onSuccess: { result in
                    Task { await handleAppleLogin(result) }
                },
                onError: { error in
                    errorMessage = error.localizedDescription
                },
                style: .white
            )
            .frame(height: Self.buttonHeight)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }

    private func handleAppleLogin(_ result: AppleSignInResult) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            try await authManager.loginWithApple(result)
        } catch {
            errorMessage = Self.loginErrorMessage(for: error)
        }
    }

    private static func loginErrorMessage(for error: Error) -> String {
        guard let authError = error as? AuthError else { return loginFailedMessage }
        if authError == .banned { return "To konto nie może się zalogować. Skontaktuj się z pomocą." }
        #if DEBUG
        if case .server(let statusCode, _) = authError, statusCode == 401 {
            return "DEVMODE"
        }
        #endif
        return loginFailedMessage
    }

    private static let loginFailedMessage = "Nie udało się zalogować. Spróbuj ponownie."
}
