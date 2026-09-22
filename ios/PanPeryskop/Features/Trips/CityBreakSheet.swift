import SwiftUI

struct CityBreakSheet: View {
    @ObservedObject var viewModel: TripsViewModel
    let city: TravelCity

    @State private var detent: PresentationDetent = .medium

    var body: some View {
        SheetShell(detent: $detent) {
            CityBreakPage(viewModel: viewModel, city: city)
        }
    }
}
