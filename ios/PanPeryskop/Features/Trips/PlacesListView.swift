import SwiftUI
import CoreLocation

/// Paged list of places for the expanded sheet. Loads one batch at a time and
/// fetches the next batch when the last row appears.
@MainActor
final class PlacesListModel: ObservableObject {
    @Published var places: [TravelPlace] = []
    @Published var isLoading = false
    @Published var hasMore = true
    @Published var failed = false

    private var kind: PlaceKind?
    private var lat = 0.0
    private var lng = 0.0
    private var offset = 0
    private let batch = 15

    func start(kind: PlaceKind, lat: Double, lng: Double) async {
        guard self.kind != kind || places.isEmpty else { return }
        self.kind = kind
        self.lat = lat
        self.lng = lng
        places = []
        offset = 0
        hasMore = true
        failed = false
        await loadMore()
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

/// Full vertical list shown in the same sheet when a section expands.
struct PlacesListView: View {
    let kind: PlaceKind
    let eventCoordinate: CLLocationCoordinate2D
    let airportCoordinate: CLLocationCoordinate2D?
    let nights: Int
    let onBack: () -> Void
    let onOpenURL: (URL) -> Void

    @StateObject private var model = PlacesListModel()

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: Theme.Spacing.m) {
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
                }
                .padding(Theme.Spacing.l)
            }
        }
        .task {
            await model.start(kind: kind, lat: eventCoordinate.latitude, lng: eventCoordinate.longitude)
        }
    }

    private var header: some View {
        HStack(spacing: Theme.Spacing.s) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.headline.weight(.semibold))
            }
            .buttonStyle(.plain)
            Text(kind.label)
                .font(Theme.Typo.sectionTitle)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.l)
        .padding(.bottom, Theme.Spacing.s)
    }

    private func row(_ place: TravelPlace) -> some View {
        Button {
            if let url = place.url { onOpenURL(url) }
        } label: {
            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                AsyncImage(url: URL(string: place.image)) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFill()
                    case .failure: Color(.systemGray5).overlay(Image(systemName: "photo").foregroundColor(.secondary))
                    default: Color(.systemGray5)
                    }
                }
                .frame(width: 84, height: 84)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text(place.name)
                        .font(.subheadline.weight(.bold))
                        .lineLimit(2)
                    if let rating = place.rating {
                        Text("★ \(String(format: "%.1f", rating)) · \(place.reviews ?? 0) opinii")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                    if kind == .hotel {
                        Text(place.nightlyPriceLabel)
                            .font(.subheadline.weight(.bold))
                        Text(place.totalPriceLabel(nights: nights))
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    } else {
                        Text(place.priceLabel)
                            .font(.subheadline.weight(.bold))
                    }
                    Text(place.address)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Text(place.distancesLabel(event: eventCoordinate, airport: airportCoordinate))
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
