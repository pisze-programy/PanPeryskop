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
    @State private var expanded: PlaceKind?
    @State private var browserItem: BrowserItem?
    @State private var outbound: FlightWindowCell?
    @State private var returning: FlightWindowCell?
    @State private var scrollTopToken = 0

    private static let topId = "city-break-top"

    private var event: TravelEvent { city.asTravelEvent(day: viewModel.anchorDate) }

    private var airportCoordinate: CLLocationCoordinate2D? {
        guard let connection = city.connections.first,
              let destination = viewModel.destinations.first(where: { $0.iata == connection.iata }) else { return nil }
        return CLLocationCoordinate2D(latitude: destination.lat, longitude: destination.lng)
    }

    var body: some View {
        SheetShell(detent: $detent) {
            ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: 0) {
                        Color.clear.frame(height: 0).id(Self.topId)
                        flightsSection
                        StaysSection(
                            event: event,
                            airportCoordinate: airportCoordinate,
                            checkin: outbound?.date,
                            checkout: returning?.date
                        )
                        PlacesSection(
                            kind: .attraction,
                            event: event,
                            onOpenURL: { url in browserItem = BrowserItem(url: url, access: .restricted) },
                            onExpand: { expanded = $0 }
                        )
                        PartnerBannerSection(banners: PartnerBanner.travel) { url in
                            browserItem = BrowserItem(url: url, access: .open)
                        }
                        priceFooter
                    }
                    .padding(.bottom, Theme.Spacing.xl)
                }
                .scrollBounceBehavior(.basedOnSize)
                .safeAreaInset(edge: .top, spacing: 0) {
                    TripsGamestrip(event: event, city: city, onTap: {
                        withAnimation(AppConstants.springStandard) {
                            proxy.scrollTo(Self.topId, anchor: .top)
                        }
                    })
                }
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
        .sheet(item: $expanded) { kind in
            PlacesListSheet(
                kind: kind,
                eventCoordinate: CLLocationCoordinate2D(latitude: event.lat, longitude: event.lng),
                eventDay: event.isoDay,
                onClose: { expanded = nil }
            )
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
                    Text("Sprawdź dostępne terminy")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundColor(.secondary)
                }
                .padding(Theme.Spacing.m)
                .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, Theme.Spacing.l)
        }
        .padding(.top, Theme.Spacing.section)
    }

    private var priceFooter: some View {
        TripsSectionFooter(text: "Ceny są orientacyjne i mogą się zmienić u dostawcy", showsPriceInfo: true)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.section)
    }
}
