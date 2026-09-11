import SwiftUI

struct CityListView: View {
    @Environment(\.dismiss) private var dismiss

    let selectedCity: City
    let onSelect: (City) -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(City.all) { city in
                    Button {
                        Haptics.selection()
                        onSelect(city)
                        dismiss()
                    } label: {
                        HStack {
                            Label(city.name, systemImage: "mappin.circle.fill")
                            Spacer()
                            if selectedCity.id == city.id {
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
