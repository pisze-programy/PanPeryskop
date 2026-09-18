import SwiftUI

struct CityListView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var store = CatalogueStore.shared

    let selectedCity: City
    let onSelect: (City) -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(store.cities) { entry in
                    Button {
                        Haptics.selection()
                        onSelect(entry.city)
                        dismiss()
                    } label: {
                        HStack {
                            Label(entry.name, systemImage: "mappin.circle.fill")
                            Spacer()
                            if selectedCity.id == entry.id {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.accentColor)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Wybierz miasto")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
