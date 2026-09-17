import SwiftUI
import CoreLocation

struct PlacesListSheet: View {
    let kind: PlaceKind
    let eventCoordinate: CLLocationCoordinate2D
    let eventDay: String
    let airportCoordinate: CLLocationCoordinate2D?
    let nights: Int
    let onClose: () -> Void

    @State private var detent: PresentationDetent = .medium
    @State private var browserItem: BrowserItem?

    var body: some View {
        SheetShell(detent: $detent) {
            PlacesListView(
                kind: kind,
                eventCoordinate: eventCoordinate,
                eventDay: eventDay,
                airportCoordinate: airportCoordinate,
                nights: nights,
                onBack: onClose,
                onOpenURL: { url in browserItem = BrowserItem(url: url, access: .restricted) }
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
}
