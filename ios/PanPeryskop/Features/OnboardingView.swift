import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject var authManager: AuthManager
    @Binding var pendingStoryId: String?
    @State private var isLoading = false
    @State private var errorMessage: String?

    /// Brand gradient (matches the story-background palette) — diagonal, used for
    /// both the logo ring and the app name so they line up.
    private static let brandGradient = LinearGradient(
        colors: [
            Color(hue: 0.55, saturation: 0.75, brightness: 0.65),
            Color(hue: 0.68, saturation: 0.75, brightness: 0.65),
            Color(hue: 0.82, saturation: 0.75, brightness: 0.65),
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                Image("Logo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 140, height: 140)
                    .clipShape(Circle())
                    .shadow(color: .primary.opacity(0.15), radius: 10, x: 0, y: 4)
                    .overlay(
                        Circle()
                            .stroke(Self.brandGradient, lineWidth: 3)
                    )

                Text("Pan Peryskop")
                    .font(.system(size: 42, weight: .bold, design: .rounded))
                    .foregroundStyle(Self.brandGradient)

                Text("Od Warszawy, Krakowa i Poznania\npo Trójmiasto! Mamy je wszystkie!")
                    .font(.title3)
                    .multilineTextAlignment(.center)
                    .foregroundColor(.secondary)

                VStack(alignment: .leading, spacing: 16) {
                    Label("Koncerty, kino, teatr, spotkania i więcej!", systemImage: "map")
                    Label("Treści na żywo od innych użytkowników", systemImage: "video.fill")
                    Label("Zobacz co się, dzieje w Twojej okolicy!", systemImage: "bell.fill")
                }
                .font(.subheadline)
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 40)
                .padding(.vertical, 8)

                Spacer()

                if let error = errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                        .padding(.horizontal)
                }

                VStack(spacing: 12) {
                    AppleSignInButton(
                        onSuccess: { result in
                            Task { await handleAppleLogin(result) }
                        },
                        onError: { error in
                            errorMessage = error.localizedDescription
                        }
                    )
                    .frame(height: 50)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                }
                .padding(.horizontal, 32)

                Spacer()
                    .frame(height: 60)
            }
        }
    }

    private func handleAppleLogin(_ result: AppleSignInResult) async {
        isLoading = true
        errorMessage = nil
        do {
            try await authManager.loginWithApple(result)
        } catch let error as AuthError where error == .banned {
            errorMessage = "Twoje urządzenie jest zbanowane."
        } catch let error as AuthError {
            if case .server(let statusCode, _) = error, statusCode == 401 {
                #if DEBUG
                errorMessage = "Produkcja odrzuca symulowany token Apple (dev-sim). Zaloguj się buildem Release."
                #else
                errorMessage = "Nie udało się zalogować przez Apple. Spróbuj ponownie."
                #endif
            } else {
                errorMessage = "Nie udało się zalogować przez Apple. Sprawdź połączenie i spróbuj ponownie."
            }
        } catch {
            errorMessage = "Nie udało się zalogować przez Apple. Sprawdź połączenie i spróbuj ponownie."
        }
        isLoading = false
    }
}
