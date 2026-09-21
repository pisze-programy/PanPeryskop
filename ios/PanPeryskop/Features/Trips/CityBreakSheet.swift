import SwiftUI
import CoreLocation

/// City-break sheet. The map is the entry, this sheet is the detail: the photo,
/// the dates and the fare, the city facts, the weather, the neighbours, then the
/// bookings.
struct CityBreakSheet: View {
    @ObservedObject var viewModel: TripsViewModel
    @State private var current: TravelCity

    init(viewModel: TripsViewModel, city: TravelCity) {
        self.viewModel = viewModel
        _current = State(initialValue: city)
    }

    @Environment(\.dismiss) private var dismiss
    @State private var detent: PresentationDetent = .medium
    @State private var showsFlights = false
    @State private var expanded: PlaceKind?
    @State private var browserItem: BrowserItem?
    @State private var outbound: FlightWindowCell?
    @State private var returning: FlightWindowCell?

    private static let topId = "city-break-top"

    private var event: TravelEvent { current.asTravelEvent(day: viewModel.anchorDate) }

    private var airportCoordinate: CLLocationCoordinate2D? {
        guard let connection = current.connections.first,
              let destination = viewModel.destinations.first(where: { $0.iata == connection.iata }) else { return nil }
        return CLLocationCoordinate2D(latitude: destination.lat, longitude: destination.lng)
    }

    private var nearbyCities: [TravelCity] {
        let wanted = current.nearby
        return wanted.compactMap { id in viewModel.cities.first(where: { $0.id == id }) }
    }

    var body: some View {
        SheetShell(detent: $detent) {
            ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: 0) {
                        Color.clear.frame(height: 0).id(Self.topId)
                        ForEach(CityBreakSection.sections(for: current)) { section in
                            sectionView(section)
                        }
                    }
                    .padding(.bottom, Theme.Spacing.xl)
                }
                .scrollBounceBehavior(.basedOnSize)
                .safeAreaInset(edge: .top, spacing: 0) {
                    TripsGamestrip(event: event, city: current, onTap: {
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
                city: current,
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

    @ViewBuilder
    private func sectionView(_ section: CityBreakSection) -> some View {
        switch section {
        case .hero:
            CityHeroSection(city: current)
        case .flights:
            flightsSection
        case .facts:
            CityFactsSection(city: current)
                .padding(.top, Theme.Spacing.section)
        case .weather:
            CityWeatherSection(city: current)
                .padding(.top, Theme.Spacing.section)
        case .nearby:
            CityNearbySection(cities: nearbyCities) { other in
                current = other
            }
            .padding(.top, Theme.Spacing.section)
        case .stays:
            StaysSection(
                event: event,
                airportCoordinate: airportCoordinate,
                checkin: outbound?.date,
                checkout: returning?.date
            )
            .padding(.top, Theme.Spacing.section)
        case .places:
            PlacesSection(
                kind: .attraction,
                event: event,
                onOpenURL: { url in browserItem = BrowserItem(url: url, access: .restricted) },
                onExpand: { expanded = $0 }
            )
            .padding(.top, Theme.Spacing.section)
        case .partners:
            PartnerBannerSection(banners: PartnerBanner.travel) { url in
                browserItem = BrowserItem(url: url, access: .open)
            }
            .padding(.top, Theme.Spacing.section)
        case .sources:
            CitySourcesSection()
                .padding(.top, Theme.Spacing.section)
        }
    }

    private var flightsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            TripsSectionHeader(title: current.connections.isEmpty ? "Autobus" : "Loty")
                .padding(.horizontal, Theme.Spacing.l)
            if current.connections.isEmpty {
                busSection
            } else {
                flightsButton
            }
        }
        .padding(.top, Theme.Spacing.section)
    }

    /// No flight reaches this city from the origin, so the bus is the way in. A
    /// placeholder until the bus calendar lands.
    private var busSection: some View {
        BusDirectionSection(
            fromCity: viewModel.selectedCity.name,
            toCity: current.displayName,
            days: busDays,
            eventDay: viewModel.anchorDate,
            eventIcon: "bus",
            scrollAnchor: .leading,
            isActive: true
        )
        .padding(.horizontal, Theme.Spacing.l)
    }

    private var busDays: [Date] {
        let calendar = AppConstants.warsawCalendar
        let start = calendar.startOfDay(for: viewModel.anchorDate)
        return (0..<3).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
    }

    private var flightsButton: some View {
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
}
