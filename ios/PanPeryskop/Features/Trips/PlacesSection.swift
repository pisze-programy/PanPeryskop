import SwiftUI

struct PlacesSection: View {
    let kind: PlaceKind
    let event: TravelEvent
    var info: String? = nil
    let onOpenURL: (URL) -> Void
    let onExpand: (PlaceKind) -> Void

    @StateObject private var loader = PlacePreviewLoader()

    var body: some View {
        if isLoadingEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                TripsSectionHeader(title: kind.label, info: info)
                    .padding(.horizontal, Theme.Spacing.l)
                content
            }
            .padding(.top, Theme.Spacing.section)
            .task {
                await loader.load(kind: kind, lat: event.lat, lng: event.lng, day: event.isoDay)
            }
        }
    }

    private var isLoadingEmpty: Bool {
        if case .empty = state { return true }
        return false
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
                places: loader.places,
                total: loader.total,
                onOpen: { place in
                    if let url = place.url { onOpenURL(url) }
                },
                onSeeMore: { onExpand(kind) }
            )
        case .empty:
            EmptyView()
        case .loading:
            PlacesCardSkeleton()
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
