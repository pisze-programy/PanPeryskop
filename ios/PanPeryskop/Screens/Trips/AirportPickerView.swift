import SwiftUI

/// Origin-airport picker (Wycieczki) — Polish airports from the hardcoded catalog,
/// modelled on CityListView. Selecting flies the Europe map out from that airport.
struct AirportPickerView: View {
    @Environment(\.dismiss) private var dismiss

    let selectedAirport: Airport
    let onSelect: (Airport) -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(TripsData.polishAirports) { airport in
                    Button {
                        Haptics.selection()
                        onSelect(airport)
                        dismiss()
                    } label: {
                        HStack {
                            Label("\(airport.iata) · \(airport.city)", systemImage: "airplane")
                            Spacer()
                            if selectedAirport.id == airport.id {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.accentColor)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Wybierz lotnisko")
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