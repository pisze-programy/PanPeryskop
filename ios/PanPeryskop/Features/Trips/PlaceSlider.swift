import SwiftUI
import CoreLocation

/// Horizontal rail of place cards with a see-more tile.
struct PlaceSlider: View {
    let places: [TravelPlace]
    let eventCoordinate: CLLocationCoordinate2D
    let airportCoordinate: CLLocationCoordinate2D?
    var selectedId: String? = nil
    var maxVisible: Int = 3
    var onSelect: (TravelPlace) -> Void
    var onSeeMore: () -> Void

    private var visible: [TravelPlace] { Array(places.prefix(maxVisible)) }
    private var hasMore: Bool { places.count > maxVisible }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                ForEach(visible) { place in
                    PlaceCard(
                        place: place,
                        eventCoordinate: eventCoordinate,
                        airportCoordinate: airportCoordinate,
                        onTap: { onSelect(place) }
                    )
                    .overlay(alignment: .topTrailing) {
                        if place.id == selectedId {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.title3)
                                .foregroundColor(.white)
                                .background(Circle().fill(Color.accentColor))
                                .padding(6)
                        }
                    }
                }
                if hasMore {
                    seeMoreTile
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.s)
        }
    }

    private var seeMoreTile: some View {
        Button {
            Haptics.selection()
            onSeeMore()
        } label: {
            VStack(spacing: Theme.Spacing.s) {
                Image(systemName: "ellipsis.circle")
                    .font(.title)
                Text("Zobacz więcej")
                    .font(.subheadline.weight(.semibold))
                Text("\(places.count)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .frame(width: 200, height: 210)
            .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
        }
        .buttonStyle(.plain)
    }
}
