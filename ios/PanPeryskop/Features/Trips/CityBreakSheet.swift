import SwiftUI
import CoreLocation

/// City-break sheet. The same sections as an event sheet — stays, attractions,
/// partners — but the flights are a button into a month calendar, because a city
/// has no event day.
struct CityBreakSheet: View {
    @ObservedObject var viewModel: TripsViewModel
    let city: TravelCity

    @Environment(\.dismiss) private var dismiss
    @State private var detent: PresentationDetent = .medium
    @State private var showsFlights = false
    @State private var browserItem: BrowserItem?
    @State private var outbound: FlightWindowCell?
    @State private var returning: FlightWindowCell?

    /// Placeholder count until the city images land. More than three photos make
    /// the hero scroll horizontally.
    private static let heroPlaceholders = 4

    private var event: TravelEvent { city.asTravelEvent(day: viewModel.anchorDate) }

    private var heroPhotos: [URL?] { Array(repeating: nil, count: Self.heroPlaceholders) }

    private var airportCoordinate: CLLocationCoordinate2D? {
        guard let connection = city.connections.first,
              let destination = viewModel.destinations.first(where: { $0.iata == connection.iata }) else { return nil }
        return CLLocationCoordinate2D(latitude: destination.lat, longitude: destination.lng)
    }

    var body: some View {
        SheetShell(detent: $detent) {
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    CityHeroView(photos: heroPhotos)
                        .padding(.top, Theme.Spacing.l)
                    connectionsSection
                    flightsSection
                    StaysSection(
                        event: event,
                        airportCoordinate: airportCoordinate,
                        checkin: outbound?.date,
                        checkout: returning?.date
                    )
                    PlaceGrid(kind: .attraction, event: event) { url in
                        browserItem = BrowserItem(url: url, access: .restricted)
                    }
                    PartnerBannerSection(banners: PartnerBanner.travel) { url in
                        browserItem = BrowserItem(url: url, access: .open)
                    }
                    priceFooter
                }
                .padding(.bottom, Theme.Spacing.xl)
            }
            .scrollBounceBehavior(.basedOnSize)
            .safeAreaInset(edge: .top, spacing: 0) {
                CityBreakStickyHeader(city: city) { dismiss() }
            }
        }
        .sheet(isPresented: $showsFlights) {
            CityFlightSheet(
                viewModel: viewModel,
                city: city,
                outbound: $outbound,
                returning: $returning
            )
        }
        .sheet(item: $browserItem) { item in
            InAppBrowserView(
                url: item.url,
                allowAnyHost: item.access == .open,
                onClose: { browserItem = nil }
            )
            .presentationDetents([.medium, .large])
        }
    }

    private var connectionsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            TripsSectionHeader(title: "Połączenia")
                .padding(.horizontal, Theme.Spacing.l)
            if city.connections.isEmpty {
                Text("Brak bezpośredniego lotu tego dnia")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, Theme.Spacing.l)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(city.connections.enumerated()), id: \.element.iata) { index, connection in
                        if index > 0 { Divider().padding(.leading, Theme.Spacing.m) }
                        connectionRow(connection)
                    }
                }
                .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
                .padding(.horizontal, Theme.Spacing.l)
            }
        }
        .padding(.top, Theme.Spacing.section)
    }

    private func connectionRow(_ connection: CityConnection) -> some View {
        HStack(spacing: Theme.Spacing.s) {
            Text(connection.iata)
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .frame(minWidth: 40, alignment: .leading)
            Text(connection.carriers.map(Self.carrierLabel).joined(separator: ", "))
                .font(.subheadline)
                .foregroundColor(.secondary)
            Spacer(minLength: 0)
        }
        .padding(Theme.Spacing.m)
    }

    private static func carrierLabel(_ raw: String) -> String {
        switch raw {
        case "ryanair": return "Ryanair"
        case "wizzair": return "Wizz Air"
        default: return raw
        }
    }

    private var flightsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            TripsSectionHeader(title: "Loty")
                .padding(.horizontal, Theme.Spacing.l)
            Button {
                Haptics.selection()
                showsFlights = true
            } label: {
                HStack(spacing: Theme.Spacing.s) {
                    Image(systemName: "calendar")
                        .font(.body)
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Sprawdź dostępne terminy")
                            .font(.subheadline.weight(.semibold))
                        Text(summary ?? "Kalendarz cen na cały miesiąc")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundColor(.secondary)
                }
                .padding(Theme.Spacing.m)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, Theme.Spacing.l)
        }
        .padding(.top, Theme.Spacing.section)
    }

    private var summary: String? {
        guard let outbound, let returning else { return nil }
        let total = Int((outbound.price ?? 0) + (returning.price ?? 0))
        return "\(outbound.date) → \(returning.date) · \(total) zł"
    }

    private var priceFooter: some View {
        TripsSectionFooter(text: "Ceny są orientacyjne i mogą się zmienić u dostawcy", showsPriceInfo: true)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.section)
    }
}
