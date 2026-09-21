import SwiftUI

/// Attractions for a city break as a two-column photo grid, instead of the
/// event slider. Cards keep their slider size, so nothing new is styled.
struct PlaceGrid: View {
    let kind: PlaceKind
    let event: TravelEvent
    let onOpenURL: (URL) -> Void

    @StateObject private var loader = PlacePreviewLoader()

    private static let maxVisible = 6

    private var columns: [GridItem] {
        [GridItem(.flexible(), spacing: Theme.Spacing.m), GridItem(.flexible(), spacing: Theme.Spacing.m)]
    }

    private var cardWidth: CGFloat {
        let usable = UIScreen.main.bounds.width - Theme.Spacing.l * 2 - Theme.Spacing.m
        return max(140, usable / 2)
    }

    var body: some View {
        if loader.places.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                TripsSectionHeader(title: kind.label)
                    .padding(.horizontal, Theme.Spacing.l)
                LazyVGrid(columns: columns, spacing: Theme.Spacing.m) {
                    ForEach(loader.places.prefix(Self.maxVisible)) { place in
                        PlaceCard(place: place, width: cardWidth) {
                            if let url = place.url { onOpenURL(url) }
                        }
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
            }
            .padding(.top, Theme.Spacing.section)
            .task {
                await loader.load(kind: kind, lat: event.lat, lng: event.lng, day: event.isoDay)
            }
        }
    }
}
