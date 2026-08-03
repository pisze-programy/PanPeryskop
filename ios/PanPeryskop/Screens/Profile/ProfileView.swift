import SwiftUI

struct ProfileView: View {
    @Binding var isPresented: Int
    @EnvironmentObject private var authManager: AuthManager

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer().frame(height: 40)

                Image(systemName: "person.circle.fill")
                    .font(.system(size: 80))
                    .foregroundColor(.accentColor)

                Text("PanPeryskop")
                    .font(.title)
                    .fontWeight(.bold)

                if let userId = authManager.userId {
                    Text("ID urządzenia: \(userId.prefix(16))...")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                VStack(spacing: 12) {
                    Label("Treści widoczne przez 24 godziny", systemImage: "clock")
                    Label("Twoja lokalizacja jest przypisywana automatycznie", systemImage: "location.fill")
                    Label("Publikujesz za darmo i bez rejestracji", systemImage: "lock.open.fill")
                }
                .font(.caption)
                .foregroundColor(.secondary)
                .padding()
                .background(.regularMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .padding(.horizontal)

                Spacer()

                Button(role: .destructive) {
                    authManager.logout()
                } label: {
                    Label("Wyloguj się", systemImage: "rectangle.portrait.and.arrow.right")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .padding(.horizontal, 32)

                Spacer().frame(height: 20)
            }
            .navigationTitle("Profil")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zamknij") {
                        withAnimation { isPresented = 0 }
                    }
                }
            }
        }
    }
}
