import SwiftUI

struct StaysSortSheet: View {
    @Binding var sort: StaysSort
    @Binding var anchor: StaysAnchor
    var venueIsAirport: Bool = false
    let checkin: String
    let checkout: String

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Lokalizacja") {
                    ForEach(StaysAnchor.options(venueIsAirport: venueIsAirport)) { option in
                        SheetOptionRow(title: option.label, isSelected: anchor == option) {
                            anchor = option
                        }
                        .listRowInsets(EdgeInsets())
                    }
                }
                Section("Cena") {
                    ForEach(StaysSort.priceOptions.indices, id: \.self) { index in
                        priceRow(StaysSort.priceOptions[index])
                    }
                }
                Section("Standard") {
                    ForEach(StaysSort.starOptions.indices, id: \.self) { index in
                        starRow(StaysSort.starOptions[index])
                    }
                }
                Section("Ocena gości") {
                    ForEach(StaysSort.guestOptions.indices, id: \.self) { index in
                        guestRow(StaysSort.guestOptions[index])
                    }
                }
            }
            .navigationTitle("Dostosuj")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Gotowe") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func priceRow(_ option: (String, String)) -> some View {
        SheetOptionRow(title: priceTitle(option), isSelected: sort.priceper == option.0) {
            sort.priceper = option.0
        }
        .listRowInsets(EdgeInsets())
    }

    private func priceTitle(_ option: (String, String)) -> String {
        guard option.0 == StaysSort.total else { return option.1 }
        return StayRange.totalPriceLabel(from: checkin, to: checkout)
    }

    private func starRow(_ option: (Int?, String)) -> some View {
        SheetOptionRow(title: option.1, isSelected: sort.minstars == option.0) {
            sort.minstars = option.0
        }
        .listRowInsets(EdgeInsets())
    }

    private func guestRow(_ option: (Int?, String)) -> some View {
        SheetOptionRow(title: option.1, isSelected: sort.minguest == option.0) {
            sort.minguest = option.0
        }
        .listRowInsets(EdgeInsets())
    }
}
