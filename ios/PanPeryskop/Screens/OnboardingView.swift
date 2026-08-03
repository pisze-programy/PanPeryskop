import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject var authManager: AuthManager
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.1, green: 0.1, blue: 0.35), Color(red: 0.05, green: 0.05, blue: 0.15)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                Image(systemName: "binoculars.fill")
                    .font(.system(size: 72))
                    .foregroundColor(.white)

                Text("PanPeryskop")
                    .font(.system(size: 42, weight: .bold, design: .rounded))
                    .foregroundColor(.white)

                Text("Zobacz co się dzieje\nw Twoim mieście")
                    .font(.title3)
                    .multilineTextAlignment(.center)
                    .foregroundColor(.white.opacity(0.8))

                Spacer()

                if let error = errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                        .padding(.horizontal)
                }

                Button(action: { Task { await performLogin() } }) {
                    HStack {
                        if isLoading {
                            ProgressView()
                                .tint(.white)
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
