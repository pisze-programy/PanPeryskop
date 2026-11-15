import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var authManager: AuthManager

    @State private var showDeleteConfirm = false
    @State private var isDeleting = false

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.xl) {
                policySection
                accountSection
                Spacer().frame(height: 120)
            }
            .padding(.vertical, 20)
        }
        .scrollContentBackground(.hidden)
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle("Ustawienia")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Usunąć konto?", isPresented: $showDeleteConfirm) {
            Button("Usuń konto", role: .destructive) {
                Task { await deleteAccount() }
            }
            Button("Anuluj", role: .cancel) {}
        } message: {
            Text("To usunie na zawsze Twoje konto i wszystkie dane. Tej operacji nie można cofnąć.")
        }
    }

    private var policySection: some View {
        NavigationLink {
            AppPolicyView()
        } label: {
            HStack(spacing: Theme.Spacing.m) {
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
            .padding(Theme.Spacing.m)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card))
        }
        .buttonStyle(.plain)
        .padding(.horizontal)
    }

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button(role: .destructive) {
                showDeleteConfirm = true
            } label: {
                HStack(spacing: Theme.Spacing.m) {
                    deleteIcon
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Usuń konto")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(.red)
                        Text("Na zawsze usuwa konto i wszystkie dane.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                }
                .padding(Theme.Spacing.m)
                .background(.regularMaterial)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card))
            }
            .buttonStyle(.plain)
            .disabled(isDeleting)

            Text("Uwaga: usunięcie konta usuwa również Twoją zawartość z mapy. Nie będzie można jej przywrócić.")
                .font(.caption2)
                .foregroundColor(.secondary)
                .padding(.horizontal, Theme.Spacing.xs)
        }
        .padding(.horizontal)
    }

    @ViewBuilder
    private var deleteIcon: some View {
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
}
