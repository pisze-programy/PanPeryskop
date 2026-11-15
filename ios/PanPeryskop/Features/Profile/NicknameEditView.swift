import SwiftUI

struct NicknameEditView: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    private let initialTrimmed: String
    @State private var name: String
    @State private var isSaving = false
    @State private var errorMessage: String?
    @FocusState private var isNameFocused: Bool

    init(initial: String) {
        self.initialTrimmed = initial.trimmingCharacters(in: .whitespacesAndNewlines)
        _name = State(initialValue: initial)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nazwa użytkownika", text: $name)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($isNameFocused)
                } footer: {
                    Text("Nazwa użytkownika nie może być pusta (3–30 znaków).")
                }

                errorSection
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
            .onAppear {
                isNameFocused = true
            }
        }
        .interactiveDismissDisabled(isSaving)
    }

    @ViewBuilder
    private var errorSection: some View {
        if let errorMessage {
            Section {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }

    private var trimmed: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isValid: Bool {
        (3...30).contains(trimmed.count) && trimmed != initialTrimmed
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
