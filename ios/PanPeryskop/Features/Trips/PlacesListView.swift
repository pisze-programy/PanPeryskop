import SwiftUI
import CoreLocation

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
    private var offset = 0
    private let batch = 15

    func start(kind: PlaceKind, lat: Double, lng: Double) async {
        self.kind = kind
        self.lat = lat
        self.lng = lng
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
            let resp = try await APIClient.getTravelPlaces(kind: kind, lat: lat, lng: lng, limit: batch, offset: offset)
            places.append(contentsOf: resp.places)
            offset += resp.places.count
            hasMore = resp.hasMore
        } catch {
            failed = true
            hasMore = false
        }
    }
}

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
                            row(place)
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

    private func row(_ place: TravelPlace) -> some View {
        Button {
            if let url = place.url { onOpenURL(url) }
        } label: {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                HStack(alignment: .center, spacing: Theme.Spacing.m) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(place.name)
                            .font(.headline.weight(.bold))
                            .lineLimit(2)
                        if let rating = place.rating {
                            Text("★ \(String(format: "%.1f", rating)) · \(place.reviews ?? 0) opinii")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        if kind == .hotel {
                            Text(place.nightlyPriceLabel)
                                .font(.subheadline.weight(.bold))
                            Text(place.totalPriceLabel(nights: nights))
                                .font(.caption)
                                .foregroundColor(.secondary)
                        } else {
                            Text(place.priceLabel)
                                .font(.subheadline.weight(.bold))
                        }
                        Text(place.address)
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(place.distancesLabel(event: eventCoordinate, airport: airportCoordinate))
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.secondary)
                }
                gallery(place)
            }
            .padding(Theme.Spacing.m)
            .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func gallery(_ place: TravelPlace) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                AsyncImage(url: URL(string: place.image)) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFill()
                    case .failure: Color(.systemGray5).overlay(Image(systemName: "photo").foregroundColor(.secondary))
                    default: Color(.systemGray5)
                    }
                }
                .containerRelativeFrame(.horizontal)
                .frame(height: 180)
            }
        }
        .frame(height: 180)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous))
    }
}

struct PlaceRowSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            SkeletonBlock(width: 160, height: 16)
            SkeletonBlock(width: 90, height: 11)
            SkeletonBlock(width: 70, height: 14)
            SkeletonBlock(width: 130, height: 10)
            SkeletonBlock(height: 180, radius: Theme.Radius.chip)
        }
        .padding(Theme.Spacing.m)
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
        .skeletonPulse()
    }
}
