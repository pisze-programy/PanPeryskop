import SwiftUI

struct PlaceRowsList: View {
    @ObservedObject var model: PlacesListModel
    let onOpenURL: (URL) -> Void

    var body: some View {
        LazyVStack(spacing: Theme.Spacing.l) {
            ForEach(model.places) { place in
                PlaceRowView(place: place) {
                    if let url = place.url { onOpenURL(url) }
                }
                .onAppear { loadMoreIfLast(place) }
            }
            if model.isLoading {
                ProgressView()
                    .padding(.vertical, Theme.Spacing.l)
            }
        }
    }

    private func loadMoreIfLast(_ place: TravelPlace) {
        guard place.id == model.places.last?.id else { return }
        Task { await model.loadMore() }
    }
}
