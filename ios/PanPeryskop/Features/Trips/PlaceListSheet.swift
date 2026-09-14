import SwiftUI
import CoreLocation

/// Full vertical list for a section, presented as a large sheet when
/// "Zobacz więcej" is tapped. The header's back control returns to the event
/// sheet. Selecting a row picks the place and closes the list.
struct PlaceListSheet: View {
    let title: String
    let places: [TravelPlace]
    let eventCoordinate: CLLocationCoordinate2D
    let airportCoordinate: CLLocationCoordinate2D?
    var selectedId: String? = nil
    var onSelect: (TravelPlace) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: Theme.Spacing.m) {
                    ForEach(places) { place in
                        row(place)
                    }
                }
                .padding(Theme.Spacing.l)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Label("Wróć", systemImage: "chevron.left")
                            .labelStyle(.titleAndIcon)
                    }
                }
            }
        }
        .presentationDetents([.large])
    }

    private func row(_ place: TravelPlace) -> some View {
        Button {
            Haptics.selection()
            onSelect(place)
            dismiss()
        } label: {
            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                thumbnail(place)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(place.name)
                            .font(.subheadline.weight(.bold))
                            .lineLimit(2)
                        Spacer(minLength: 0)
                        Text(place.priceLabel)
                            .font(.subheadline.weight(.bold))
                    }
                    if let rating = place.rating {
                        Text("★ \(String(format: "%.1f", rating)) · \(place.reviews ?? 0) opinii")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                    Text(place.address)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Text(place.distancesLabel(event: eventCoordinate, airport: airportCoordinate))
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if place.id == selectedId {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.accentColor)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func thumbnail(_ place: TravelPlace) -> some View {
        AsyncImage(url: URL(string: place.image)) { phase in
            switch phase {
            case .success(let img): img.resizable().scaledToFill()
            case .failure: Color(.systemGray5).overlay(Image(systemName: "photo").foregroundColor(.secondary))
            default: Color(.systemGray5)
            }
        }
        .frame(width: 84, height: 84)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous))
    }
}
