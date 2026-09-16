import SwiftUI
import CoreLocation

@MainActor
final class PlacePreviewLoader: ObservableObject {
    @Published var places: [TravelPlace] = []
    @Published var failed = false
    private var loadedKind: PlaceKind?

    func load(kind: PlaceKind, lat: Double, lng: Double) async {
        if loadedKind == kind, !places.isEmpty { return }
        failed = false
        do {
            let resp = try await APIClient.getTravelPlaces(kind: kind, lat: lat, lng: lng, limit: 15, offset: 0)
            places = resp.places
            loadedKind = kind
        } catch {
            failed = true
        }
    }
}

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
        .onScrollVisibilityChange(threshold: 0.1) { visible in
            guard visible else { return }
            Task { await loader.load(kind: kind, lat: event.lat, lng: event.lng) }
        }
        .sheet(isPresented: $showFilter) {
            HotelFilterSheet(selection: $tier)
        }
    }

    @ViewBuilder
    private var content: some View {
        if loader.failed {
            ErrorState(message: "Nie udało się pobrać: \(kind.label)") {
                Task { await loader.load(kind: kind, lat: event.lat, lng: event.lng) }
            }
            .padding(.horizontal, Theme.Spacing.l)
        } else if loader.places.isEmpty {
            skeleton
        } else {
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
        }
    }

    private var skeleton: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                ForEach(0..<3, id: \.self) { _ in
                    PlaceSkeletonCard()
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.s)
        }
        .disabled(true)
    }
}

struct HotelFilterSheet: View {
    @Binding var selection: HotelTier
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            Text("Filtruj noclegi")
                .font(Theme.Typo.sectionTitle)
                .padding(Theme.Spacing.l)
            ForEach(HotelTier.allCases, id: \.self) { tier in
                Button {
                    Haptics.selection()
                    selection = tier
                    dismiss()
                } label: {
                    HStack {
                        Text(tier.label)
                            .font(.body)
                        Spacer()
                        if selection == tier {
                            Image(systemName: "checkmark")
                                .foregroundColor(.accentColor)
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, Theme.Spacing.m)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Divider()
            }
        }
        .presentationDetents([.height(240)])
    }
}
