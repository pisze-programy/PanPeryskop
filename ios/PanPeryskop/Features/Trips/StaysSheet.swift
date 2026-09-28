import SwiftUI
import CoreLocation

struct StaysSheet: View {
    let event: TravelEvent
    let airportCoordinate: CLLocationCoordinate2D?
    @Binding var anchor: StaysAnchor
    var options: [StaysAnchor] = StaysAnchor.allCases
    let checkin: String
    let checkout: String
    var minstars: Int?
    var minguest: Int?
    var minPrice: Int?
    var maxPrice: Int?
    var segment: Binding<HotelSegment>?
    let onClose: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var detent: PresentationDetent = .large
    @State private var sort = StaysSort()
    @State private var showSort = false
    @State private var webFailed = false
    @State private var reloadToken = 0
    @StateObject private var loader = StaysWidgetLoader()

    private var point: StaysAnchorPoint {
        StaysAnchorPoint.resolve(anchor, event: event, airportCoordinate: airportCoordinate)
    }

    private var query: StaysWidgetQuery {
        StaysWidgetQuery(
            point: point,
            checkin: checkin,
            checkout: checkout,
            theme: colorScheme == .dark ? "dark" : "light",
            view: .full,
            priceper: sort.priceper,
            minstars: sort.minstars ?? minstars,
            minguest: sort.minguest ?? minguest,
            adults: sort.adults,
            minPrice: minPrice,
            maxPrice: maxPrice,
            nearLat: event.lat,
            nearLng: event.lng
        )
    }

    var body: some View {
        SheetShell(detent: $detent, detents: [.large]) {
            NavigationStack {
                VStack(spacing: 0) {
                    header
                    segmentRow
                    content
                }
                .navigationTitle("Noclegi")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Anuluj", action: onClose)
                    }
                    ToolbarItem(placement: .primaryAction) {
                        FilterButton(label: "Dostosuj", isActive: sort.isActive) {
                            showSort = true
                        }
                    }
                }
            }
        }
        .task(id: query.key) {
            webFailed = false
            await loader.load(query)
        }
        .sheet(isPresented: $showSort) {
            StaysSortSheet(sort: $sort, anchor: $anchor, options: options, checkin: checkin, checkout: checkout)
        }
    }

    private var header: some View {
        Text(StayRange.label(from: checkin, to: checkout))
            .font(.footnote)
            .foregroundColor(.secondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, Theme.Spacing.s)
    }

    @ViewBuilder
    private var segmentRow: some View {
        if let segment {
            HStack(spacing: Theme.Spacing.s) {
                ForEach(HotelSegment.allCases) { option in
                    Button {
                        Haptics.selection()
                        segment.wrappedValue = option
                    } label: {
                        Text(option.label)
                            .font(.caption.weight(.semibold))
                            .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(
                            segment.wrappedValue == option ? Color.accentColor.opacity(0.15) : Theme.Palette.surface,
                            in: RoundedRectangle(cornerRadius: Theme.Radius.card)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.card)
                                .stroke(segment.wrappedValue == option ? Color.accentColor : .clear, lineWidth: 1.5)
                        )
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.bottom, Theme.Spacing.s)
        }
    }

    @ViewBuilder
    private var content: some View {
        if let url = loader.url, !webFailed {
            Stay22MapView(url: url) { webFailed = true }
                .id(reloadToken)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if loader.failed || webFailed {
            ErrorState(message: "Nie udało się wczytać noclegów") {
                retry()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func retry() {
        webFailed = false
        reloadToken += 1
        Task { await loader.reload(query) }
    }
}
