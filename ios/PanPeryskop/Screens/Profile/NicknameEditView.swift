import SwiftUI

struct NicknameEditView: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(initial: String) {
        _name = State(initialValue: initial)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nazwa użytkownika", text: $name)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } footer: {
                    Text("Nazwa użytkownika nie może być pusta (3–30 znaków).")
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Zmień nazwę użytkownika")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") { Task { await save() } }
                        .disabled(!isValid || isSaving)
                }
            }
        }
        .interactiveDismissDisabled(isSaving)
    }

    private var trimmed: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var isValid: Bool {
        (3...30).contains(trimmed.count)
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await authManager.updateUsername(trimmed)
            dismiss()
        } catch {
            errorMessage = "Nie udało się zapisać. Spróbuj ponownie później."
        }
    }
}
