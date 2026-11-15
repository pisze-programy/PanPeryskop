import SwiftUI

struct CityBreakCountryFilterSheet: View {
    let sections: [CityBreakCountrySection]
    let initialSelectedIds: Set<String>
    let onApply: (Set<String>) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var draftIds: Set<String>

    init(
        sections: [CityBreakCountrySection],
        initialSelectedIds: Set<String>,
        onApply: @escaping (Set<String>) -> Void
    ) {
        self.sections = sections
        self.initialSelectedIds = initialSelectedIds
        self.onApply = onApply
        _draftIds = State(initialValue: initialSelectedIds)
    }

    private var allIds: Set<String> {
        Set(sections.map(\.id))
    }

    private var isEveryCountrySelected: Bool {
        !allIds.isEmpty && allIds.isSubset(of: draftIds)
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    toggleAllButton
                }
                Section {
                    ForEach(sections) { section in
                        countryRow(section)
                    }
                }
            }
            .navigationTitle("Kraje")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zatwierdź") {
                        Haptics.selection()
                        onApply(draftIds)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .disabled(draftIds.isEmpty)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var toggleAllButton: some View {
        Button(isEveryCountrySelected ? "Odznacz wszystkie" : "Zaznacz wszystkie") {
            Haptics.selection()
            toggleAll()
        }
    }

    private func countryRow(_ section: CityBreakCountrySection) -> some View {
        let isSelected = draftIds.contains(section.id)
        return Button {
            Haptics.selection()
            toggleCountry(section.id)
        } label: {
            HStack {
                Text(section.title)
                    .foregroundStyle(.primary)
                Spacer()
                checkmarkView(isSelected: isSelected)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func checkmarkView(isSelected: Bool) -> some View {
        if isSelected {
            Image(systemName: "checkmark")
                .font(.body.weight(.semibold))
                .foregroundStyle(Color.accentColor)
        }
    }

    private func toggleAll() {
        draftIds = isEveryCountrySelected ? [] : allIds
    }

    private func toggleCountry(_ id: String) {
        if draftIds.contains(id) {
            draftIds.remove(id)
            return
        }
        draftIds.insert(id)
    }
}
