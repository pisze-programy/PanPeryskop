import SwiftUI
import CoreLocation

@MainActor
final class PlaceListLoader: ObservableObject {
    @Published var places: [TravelPlace] = []
    @Published var failed = false
    private var loadedKind: PlaceKind?

    func load(kind: PlaceKind, lat: Double, lng: Double) async {
        if loadedKind == kind, !places.isEmpty { return }
        failed = false
        do {
            let resp = try await APIClient.getTravelPlaces(kind: kind, lat: lat, lng: lng)
            places = resp.places
            loadedKind = kind
        } catch {
            failed = true
        }
    }
}

/// A place section: header, optional filter, slider and full-list sheet.
struct PlacesSection: View {
    let kind: PlaceKind
    let event: TravelEvent
    let airportCoordinate: CLLocationCoordinate2D?
    var info: String? = nil
    var tiers: [HotelTier] = []
    var selectedId: String? = nil
    var onSelect: (TravelPlace) -> Void

    @StateObject private var loader = PlaceListLoader()
    @State private var tier: HotelTier = .recommended
    @State private var showList = false

    private var eventCoordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: event.lat, longitude: event.lng)
    }

    private var activeTier: HotelTier {
        tiers.contains(tier) ? tier : (tiers.first ?? .recommended)
    }

    private var places: [TravelPlace] {
        guard !tiers.isEmpty else { return loader.places }
        let inTier = loader.places.filter { $0.tier == activeTier }
        return PlaceScoring.sorted(inTier.isEmpty ? loader.places : inTier, by: activeTier)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            TripsSectionHeader(title: kind.label, info: info)
                .padding(.horizontal, Theme.Spacing.l)
            if !tiers.isEmpty {
                filterBar
            }
            content
            if !loader.places.isEmpty {
                TripsSectionFooter(text: "Ceny są orientacyjne i mogą się zmienić u dostawcy. To podgląd oferty.")
                    .padding(.horizontal, Theme.Spacing.l)
            }
        }
        .padding(.top, Theme.Spacing.l)
        .task(id: kind) {
            await loader.load(kind: kind, lat: event.lat, lng: event.lng)
        }
        .sheet(isPresented: $showList) {
            PlaceListSheet(
                title: kind.label,
                places: places,
                eventCoordinate: eventCoordinate,
                airportCoordinate: airportCoordinate,
                selectedId: selectedId,
                onSelect: onSelect
            )
        }
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.s) {
                ForEach(tiers, id: \.self) { option in
                    Chip(label: option.label, isSelected: activeTier == option) {
                        tier = option
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.xs)
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
                selectedId: selectedId,
                onSelect: onSelect,
                onSeeMore: {
                    showList = true
                }
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
