import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var authManager: AuthManager
    @AppStorage(NotificationSettings.mediaNearbyLiveKey) private var mediaNearbyLive = true
    @AppStorage(NotificationSettings.mediaNearbyEventsKey) private var mediaNearbyEvents = true
    @AppStorage(NotificationSettings.mediaNearbyRangeKey) private var mediaNearbyRange = "city"

    @State private var showDeleteConfirm = false
    @State private var isDeleting = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                notificationsCard

                PermissionCardsView(showsHeader: true)

                policySection

                accountSection
            }
            .padding(.vertical, 20)
        }
        .navigationTitle("Ustawienia")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Usunąć konto?", isPresented: $showDeleteConfirm) {
            Button("Usuń konto", role: .destructive) {
                Task { await deleteAccount() }
            }
            Button("Anuluj", role: .cancel) {}
        } message: {
            Text("To usunie na zawsze Twoje konto i całą zawartość — posty, zdjęcia i filmy. Tej operacji nie można cofnąć.")
        }
    }

    /// Second-to-last Settings item: app data policy / sources (OSM attribution).
    private var policySection: some View {
        NavigationLink {
            AppPolicyView()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "doc.text.fill")
                    .font(.title3)
                    .foregroundColor(.accentColor)
                    .frame(width: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Polityka Aplikacji")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.primary)
                    Text("Źródła danych i atrybucja.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding(12)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .padding(.horizontal)
    }

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button(role: .destructive) {
                showDeleteConfirm = true
            } label: {
                HStack(spacing: 12) {
                    if isDeleting {
                        ProgressView()
                            .tint(.red)
                            .frame(width: 32)
                    } else {
                        Image(systemName: "trash.fill")
                            .font(.title3)
                            .foregroundColor(.red)
                            .frame(width: 32)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Usuń konto")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(.red)
                        Text("Na zawsze usuwa konto i wszystkie Twoje treści.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                }
                .padding(12)
                .background(.regularMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(isDeleting)

            Text("Uwaga: usunięcie konta usuwa również całą Twoją zawartość z mapy — posty, zdjęcia i filmy. Nie będzie można ich przywrócić.")
                .font(.caption2)
                .foregroundColor(.secondary)
                .padding(.horizontal, 4)

            Divider()
                .padding(.vertical, 8)

            Button {
                Task { await authManager.logout() }
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.title3)
                        .foregroundColor(.primary)
                        .frame(width: 32)
                    Text("Wyloguj się")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.primary)
                    Spacer()
                }
                .padding(12)
                .background(.regularMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal)
    }

    @MainActor
    private func deleteAccount() async {
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await APIClient.postEmpty("/users/me/delete")
            await authManager.logout()
        } catch {
            ToastManager.shared.show("Nie udało się usunąć konta. Spróbuj ponownie.")
        }
    }

    private var notificationsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "bell.badge.fill")
                    .font(.title3)
                    .foregroundColor(.accentColor)
                    .frame(width: 32)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Powiadomienia")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                    Text("Powiadomienia o nowych mediach dodanych w okolicy.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Toggle("Nowe Live w okolicy", isOn: $mediaNearbyLive)
                .font(.subheadline)
            Toggle("Nowe Wydarzenia w okolicy", isOn: $mediaNearbyEvents)
                .font(.subheadline)

            if mediaNearbyLive || mediaNearbyEvents {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Zakres")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Picker("Zakres", selection: $mediaNearbyRange) {
                        Text("100 m").tag("100")
                        Text("300 m").tag("300")
                        Text("Miasto").tag("city")
                    }
                    .pickerStyle(.segmented)
                }
                .padding(.top, 4)
            }
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }
}
