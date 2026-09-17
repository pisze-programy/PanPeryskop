import SwiftUI
import CoreLocation

struct PlacesSection: View {
    let kind: PlaceKind
    let event: TravelEvent
    let airportCoordinate: CLLocationCoordinate2D?
    var nights: Int = 1
    var tiers: [HotelTier] = []
    var info: String? = nil
    let onOpenURL: (URL) -> Void
    let onExpand: (PlaceKind) -> Void

    @StateObject private var loader = PlacePreviewLoader()
    @State private var tier: HotelTier = .economy
    @State private var showFilter = false

    private var eventCoordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: event.lat, longitude: event.lng)
    }

    private var activeTier: HotelTier {
        tiers.contains(tier) ? tier : (tiers.first ?? .economy)
    }

    private var places: [TravelPlace] {
        guard !tiers.isEmpty else { return loader.places }
        let inTier = loader.places.filter { $0.tier == activeTier }
        return PlaceScoring.sorted(inTier.isEmpty ? loader.places : inTier, by: activeTier)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            TripsSectionHeader(
                title: kind.label,
                info: info,
                filterLabel: tiers.isEmpty ? nil : activeTier.label,
                onFilter: tiers.isEmpty ? nil : { showFilter = true }
            )
            .padding(.horizontal, Theme.Spacing.l)
            content
        }
        .padding(.top, Theme.Spacing.section)
        .task {
            await loader.load(kind: kind, lat: event.lat, lng: event.lng, day: event.isoDay)
        }
        .sheet(isPresented: $showFilter) {
            HotelFilterSheet(selection: $tier)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch state {
        case .failed:
            ErrorState(message: "Nie udało się pobrać: \(kind.label)") {
                Task { await loader.load(kind: kind, lat: event.lat, lng: event.lng, day: event.isoDay) }
            }
            .padding(.horizontal, Theme.Spacing.l)
        case .loaded:
            PlaceSlider(
                places: places,
                eventCoordinate: eventCoordinate,
                airportCoordinate: airportCoordinate,
                nights: nights,
                onOpen: { place in
                    if let url = place.url { onOpenURL(url) }
                },
                onSeeMore: { onExpand(kind) }
            )
        case .empty:
            PlacesEmptyState(kind: kind)
                .padding(.horizontal, Theme.Spacing.l)
        case .loading:
            PlacesCardSkeleton(kind: kind)
        }
    }

    private var state: PlacesContentState {
        if loader.failed { return .failed }
        if !loader.places.isEmpty { return .loaded }
        return loader.didLoad ? .empty : .loading
    }
}

private enum PlacesContentState {
    case loading
    case failed
    case empty
    case loaded
}
