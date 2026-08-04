import SwiftUI

struct CityListView: View {
    @Environment(\.dismiss) private var dismiss

    let selectedCity: City
    let onSelect: (City) -> Void

    var body: some View {
        NavigationStack {
            List {
                Section("Aktywne") {
                    ForEach(City.active) { city in
                        Button {
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

                Section {
                    ForEach(City.soon) { city in
                        HStack {
                            Text(city.name)
                            Spacer()
                            Image(systemName: "clock")
                                .font(.caption)
                        }
                        .foregroundColor(.secondary)
                        .accessibilityIdentifier("city_soon_\(city.id)")
                    }
                } header: {
                    Text("Wkrótce")
                } footer: {
                    Text("Te miasta pojawią się wkrótce.")
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
