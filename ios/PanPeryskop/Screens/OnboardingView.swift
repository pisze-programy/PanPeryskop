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

                Button(action: { Task { await performLogin() } }) {
                    HStack(spacing: 8) {
                        if isLoading {
                            ProgressView()
                        }
                        Text("Wejdź do aplikacji")
                            .font(.headline)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Color.accentColor)
                    .foregroundColor(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                }
                .padding(.horizontal, 32)
                .disabled(isLoading)

                Spacer()
                    .frame(height: 60)
            }
        }
    }

    private func performLogin() async {
        isLoading = true
        errorMessage = nil
        do {
            try await authManager.login()
        } catch {
            errorMessage = "Błąd połączenia. Spróbuj ponownie."
        }
        isLoading = false
    }
}
