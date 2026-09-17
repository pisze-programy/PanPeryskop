import Foundation

@MainActor
final class PlacesListModel: ObservableObject {
    @Published var places: [TravelPlace] = []
    @Published var isLoading = false
    @Published var isReady = false
    @Published var hasMore = true
    @Published var failed = false

    private var kind: PlaceKind?
    private var lat = 0.0
    private var lng = 0.0
    private var day = ""
    private var offset = 0
    private let batch = 15

    func start(kind: PlaceKind, lat: Double, lng: Double, day: String) async {
        self.kind = kind
        self.lat = lat
        self.lng = lng
        self.day = day
        places = []
        offset = 0
        hasMore = true
        failed = false
        isReady = false
        try? await Task.sleep(nanoseconds: 180_000_000)
        await loadMore()
        isReady = true
    }

    func loadMore() async {
        guard let kind, hasMore, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let resp = try await APIClient.getTravelPlaces(kind: kind, lat: lat, lng: lng, limit: batch, offset: offset, day: day)
            places.append(contentsOf: resp.places)
            offset += resp.places.count
            hasMore = resp.hasMore
        } catch {
            failed = true
            hasMore = false
        }
    }
}
