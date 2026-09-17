import SwiftUI

@MainActor
final class PlacePreviewLoader: ObservableObject {
    @Published var places: [TravelPlace] = []
    @Published var failed = false
    @Published private(set) var didLoad = false
    private var loadedKind: PlaceKind?
    private var loadedDay: String?

    func load(kind: PlaceKind, lat: Double, lng: Double, day: String) async {
        if loadedKind == kind, loadedDay == day { return }
        failed = false
        do {
            let resp = try await APIClient.getTravelPlaces(kind: kind, lat: lat, lng: lng, limit: 15, offset: 0, day: day)
            places = resp.places
            loadedKind = kind
            loadedDay = day
            didLoad = true
        } catch {
            failed = true
        }
    }
}
