import SwiftUI

@MainActor
final class PlacePreviewLoader: ObservableObject {
    @Published var places: [TravelPlace] = []
    @Published var total = 0
    @Published var failed = false
    @Published private(set) var didLoad = false

    private struct CacheKey: Equatable {
        let kind: PlaceKind
        let lat: Int
        let lng: Int
        let day: String
    }

    private var loadedKey: CacheKey?

    func load(kind: PlaceKind, lat: Double, lng: Double, day: String) async {
        let key = CacheKey(
            kind: kind,
            lat: Self.coordBucket(lat),
            lng: Self.coordBucket(lng),
            day: day
        )
        if loadedKey == key { return }
        if loadedKey != nil {
            loadedKey = nil
            places = []
            total = 0
            didLoad = false
        }
        failed = false
        do {
            let resp = try await APIClient.getTravelPlaces(kind: kind, lat: lat, lng: lng, limit: 15, offset: 0, day: day)
            guard !Task.isCancelled else { return }
            places = resp.places
            total = resp.total
            loadedKey = key
            didLoad = true
        } catch {
            guard !(error is CancellationError), !Task.isCancelled else { return }
            failed = true
        }
    }

    static func coordBucket(_ value: Double) -> Int {
        Int((value * 1000).rounded())
    }
}
