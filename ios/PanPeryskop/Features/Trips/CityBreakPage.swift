import SwiftUI
import CoreLocation

struct CityBreakPage: View {
    @ObservedObject var viewModel: TripsViewModel
    let city: TravelCity
    var dotsCount = 1
    var dotsIndex = 0
    var scrollTopToken = 0
    var onTapHeader: () -> Void = {}
    @State private var showsFlights = false
    @State private var expanded: PlaceKind?
    @State private var browserItem: BrowserItem?
    @State private var outbound: FlightWindowCell?
    @State private var returning: FlightWindowCell?
    @State private var hotelSegment: HotelSegment = .economy

    init(
        viewModel: TripsViewModel,
        city: TravelCity,
        dotsCount: Int = 1,
        dotsIndex: Int = 0,
        scrollTopToken: Int = 0,
        onTapHeader: @escaping () -> Void = {}
    ) {
        self.viewModel = viewModel
        self.city = city
        self.dotsCount = dotsCount
        self.dotsIndex = dotsIndex
        self.scrollTopToken = scrollTopToken
        self.onTapHeader = onTapHeader
    }

    private static let topId = "city-break-top"

    private var event: TravelEvent { city.asTravelEvent(day: viewModel.anchorDate) }

    private var staysMinPrice: Int? {
        switch hotelSegment {
        case .luxury: return min(450, max(40, city.costUsd / 15))
        default: return nil
        }
    }

    private var staysMaxPrice: Int? {
        switch hotelSegment {
        case .economy: return max(20, city.costUsd / 15)
        default: return nil
        }
    }

    private var airportCoordinate: CLLocationCoordinate2D? {
        guard let connection = city.connections.first,
              let destination = viewModel.destinations.first(where: { $0.iata == connection.iata }) else { return nil }
        return CLLocationCoordinate2D(latitude: destination.lat, longitude: destination.lng)
    }

    private var nearbyCities: [TravelCity] {
        let served = Set(viewModel.destinations.map(\.iata))
        return city.nearby
            .compactMap { id in viewModel.cities.first(where: { $0.id == id }) }
            .filter { city in city.airports.contains { served.contains($0) } }
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    Color.clear.frame(height: 0).id(Self.topId)
                    ForEach(CityBreakSection.sections(for: city)) { section in
                        sectionView(section, proxy: proxy)
                    }
                }
                .padding(.bottom, Theme.Spacing.xl)
            }
            .scrollBounceBehavior(.basedOnSize)
            .onChange(of: city.id) { _, _ in
                NotificationCenter.default.post(
                    name: .centerMapOnCoordinate,
                    object: MapCenterPayload(lat: city.lat, lng: city.lng)
                )
                withAnimation(AppConstants.springStandard) {
                    proxy.scrollTo(Self.topId, anchor: .top)
                }
            }
            .onChange(of: scrollTopToken) { _, _ in
                withAnimation(AppConstants.springStandard) {
                    proxy.scrollTo(Self.topId, anchor: .top)
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                TripsGamestrip(event: event, city: city, dotsCount: dotsCount, dotsIndex: dotsIndex, onTap: {
                    onTapHeader()
                    withAnimation(AppConstants.springStandard) {
                        proxy.scrollTo(Self.topId, anchor: .top)
                    }
                })
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
            .trackScreen("places")
        }
    }

    @ViewBuilder
    private func sectionView(_ section: CityBreakSection, proxy: ScrollViewProxy) -> some View {
        switch section {
        case .hero:
            CityHeroSection(city: city) { url in
                browserItem = BrowserItem(url: url, access: .open)
            }
        case .flights:
            flightsSection
        case .facts:
            CityFactsSection(city: city)
                .padding(.top, Theme.Spacing.section)
        case .cityEvents:
            CityEventsSection(city: city, origins: viewModel.originIatas) { event in
                viewModel.selectNearbyEvent(event)
            }
        case .nearby:
            CityNearbySection(
                cities: nearbyCities,
                from: CLLocationCoordinate2D(latitude: city.lat, longitude: city.lng)
            ) { other in
                viewModel.selectGroup(posts: [], cities: [other])
            }
            .padding(.top, Theme.Spacing.section)
        case .hotels:
            CityHotelSection(city: city)
        case .stays:
            StaysSection(
                event: event,
                airportCoordinate: airportCoordinate,
                checkin: outbound?.date,
                checkout: returning?.date,
                anchors: [.centre],
                segment: $hotelSegment,
                minstars: hotelSegment.minStars,
                minguest: hotelSegment.minGuest,
                minPrice: staysMinPrice,
                maxPrice: staysMaxPrice,
                miniZoom: city.staysMiniZoom,
                sheetZoom: city.staysSheetZoom
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
            PartnerBannerSection(
                banners: PartnerBanner.travel,
                carRental: CarRentalContext(
                    iata: reachableAirports.first?.iata ?? "",
                    from: outbound?.date,
                    to: returning?.date
                ),
                luggage: LuggageContext(
                    city: city.id,
                    iata: reachableAirports.first?.iata,
                    preferAirport: false,
                    from: outbound?.date,
                    to: returning?.date
                )
            ) { url in
                browserItem = BrowserItem(url: url, access: .open)
            }
            .padding(.top, Theme.Spacing.section)
        case .sources:
            TripsSectionFooter(text: "Ceny są orientacyjne i mogą się zmienić u dostawcy", showsPriceInfo: true)
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.section)
        }
    }

    private var reachableAirports: [Destination] {
        let wanted = Set(city.airports)
        return viewModel.destinations.filter { wanted.contains($0.iata) }
    }

    private var flightsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            TripsSectionHeader(title: reachableAirports.isEmpty ? "Autobus" : "Loty")
                .padding(.horizontal, Theme.Spacing.l)
            if reachableAirports.isEmpty {
                busSection
            } else {
                flightsButton
            }
        }
        .padding(.top, Theme.Spacing.section)
    }

    private var busSection: some View {
        BusDirectionSection(
            fromCity: viewModel.selectedCity.name,
            toCity: city.displayName,
            days: busDays,
            eventDay: viewModel.anchorDate,
            eventIcon: "bus",
            scrollAnchor: .leading,
            defaultOffset: 0,
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
