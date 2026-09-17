import SwiftUI
import CoreLocation

struct PlacesListView: View {
    let kind: PlaceKind
    let eventCoordinate: CLLocationCoordinate2D
    let eventDay: String
    let onBack: () -> Void
    let onOpenURL: (URL) -> Void

    @StateObject private var model = PlacesListModel()

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                content
                    .padding(Theme.Spacing.l)
            }
            .navigationTitle(kind.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") {
                        onBack()
                    }
                }
            }
        }
        .task {
            guard !model.isReady else { return }
            await model.start(kind: kind, lat: eventCoordinate.latitude, lng: eventCoordinate.longitude, day: eventDay)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch state {
        case .failed:
            ErrorState(message: "Nie udało się pobrać: \(kind.label)") {
                Task { await model.start(kind: kind, lat: eventCoordinate.latitude, lng: eventCoordinate.longitude, day: eventDay) }
            }
        case .loading:
            PlaceRowsSkeleton()
        case .empty:
            EmptyState(icon: "ticket", title: "Brak atrakcji w tym mieście")
        case .loaded:
            PlaceRowsList(model: model, onOpenURL: onOpenURL)
        }
    }

    private var state: PlacesListState {
        if model.failed { return .failed }
        guard model.isReady else { return .loading }
        return model.places.isEmpty ? .empty : .loaded
    }
}

private enum PlacesListState {
    case loading
    case failed
    case empty
    case loaded
}
