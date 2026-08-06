import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject var authManager: AuthManager
    @Binding var pendingStoryId: String?
    @State private var isLoading = false
    @State private var errorMessage: String?

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

                Text("Pan Peryskop")
                    .font(.system(size: 42, weight: .bold, design: .rounded))
                    .foregroundColor(.primary)

                Text("Zobacz co się dzieje\nw Twoim mieście")
                    .font(.title3)
                    .multilineTextAlignment(.center)
                    .foregroundColor(.secondary)

                VStack(alignment: .leading, spacing: 16) {
                    Label("Treści widoczne przez 24 godziny", systemImage: "clock")
                    Label("Twoja lokalizacja jest przypisywana automatycznie", systemImage: "location.fill")
                    Label("Publikujesz za darmo i bez rejestracji", systemImage: "lock.open.fill")
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

                    GoogleSignInButton(
                        onSuccess: { result in
                            Task { await handleGoogleLogin(result) }
                        },
                        onError: { error in
                            errorMessage = error.localizedDescription
                        }
                    )
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
        } catch {
            errorMessage = "Błąd logowania przez Apple. Spróbuj ponownie."
        }
        isLoading = false
    }

    private func handleGoogleLogin(_ result: GoogleSignInResult) async {
        isLoading = true
        errorMessage = nil
        do {
            try await authManager.loginWithGoogle(result)
        } catch let error as AuthError where error == .banned {
            errorMessage = "Twoje urządzenie jest zbanowane."
        } catch {
            errorMessage = "Błąd logowania przez Google. Spróbuj ponownie."
        }
        isLoading = false
    }
}
