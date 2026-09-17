import SwiftUI

/// Shared day picker sheet (events + trips): days grouped by month, one choice.
struct DayListSheet: View {
    let title: String
    let offsets: [Int]
    let selected: Int
    let onSelect: (Int) -> Void

    @Environment(\.dismiss) private var dismiss

    private var months: [String] {
        var seen = Set<String>()
        var out: [String] = []
        for offset in offsets {
            let month = DayLabels.monthTitle(offset: offset)
            if seen.insert(month).inserted { out.append(month) }
        }
        return out
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(months, id: \.self) { month in
                    Section(month) {
                        ForEach(offsets.filter { DayLabels.monthTitle(offset: $0) == month }, id: \.self) { offset in
                            row(offset)
                        }
                    }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func row(_ offset: Int) -> some View {
        Button {
            Haptics.selection()
            onSelect(offset)
            dismiss()
        } label: {
            HStack {
                Text(DayLabels.title(offset: offset))
                Spacer()
                if selected == offset {
                    Image(systemName: "checkmark")
                        .foregroundColor(.accentColor)
                }
            }
        }
    }
}
