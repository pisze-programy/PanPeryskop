import SwiftUI

struct DayListView: View {
    @Environment(\.dismiss) private var dismiss

    @ObservedObject var viewModel: MapViewModel

    var body: some View {
        NavigationStack {
            List {
                ForEach(MapViewModel.dayOffsets, id: \.self) { offset in
                    Button {
                        Haptics.selection()
                        viewModel.commitDay(offset)
                        dismiss()
                    } label: {
                        HStack {
                            Label(viewModel.dayLabel(offset: offset), systemImage: "calendar")
                            Spacer()
                            if viewModel.selectedDayOffset == offset {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.accentColor)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Wybierz dzień")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }
}
