import SwiftUI
import CoreLocation

struct PlacesListView: View {
    let kind: PlaceKind
    let eventCoordinate: CLLocationCoordinate2D
    let airportCoordinate: CLLocationCoordinate2D?
    let nights: Int
    let onBack: () -> Void
    let onOpenURL: (URL) -> Void

    @StateObject private var model = PlacesListModel()

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: Theme.Spacing.l) {
                    if model.isReady {
                        ForEach(model.places) { place in
                            PlaceRowView(
                                place: place,
                                kind: kind,
                                eventCoordinate: eventCoordinate,
                                airportCoordinate: airportCoordinate,
                                nights: nights,
                                onOpen: {
                                    if let url = place.url { onOpenURL(url) }
                                }
                            )
                            .onAppear {
                                if place.id == model.places.last?.id {
                                    Task { await model.loadMore() }
                                }
                            }
                        }
                        if model.isLoading {
                            ProgressView()
                                .padding(.vertical, Theme.Spacing.l)
                        }
                    } else {
                        ForEach(0..<4, id: \.self) { _ in
                            PlaceRowSkeleton()
                        }
                    }
                }
                .padding(Theme.Spacing.l)
            }
            .navigationTitle(kind.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        onBack()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                                .fontWeight(.semibold)
                            Text("Wróć")
                        }
                    }
                }
            }
        }
        .task {
            guard !model.isReady else { return }
            await model.start(kind: kind, lat: eventCoordinate.latitude, lng: eventCoordinate.longitude)
        }
    }
}
