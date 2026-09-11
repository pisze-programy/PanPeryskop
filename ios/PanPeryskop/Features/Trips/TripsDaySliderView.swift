import SwiftUI

/// Day picker (Wycieczki) — thin wrapper over the shared RailSliderView.
/// 0…89 days (full 90-day window), label "DD.MM" of the selected day.
/// Same density as the events/week slider — reaching day 89 needs deliberate scrubbing.
struct TripsDaySliderView: View {
    @ObservedObject var viewModel: TripsViewModel

    private static let minDay = 0
    private static let maxDay = 89
    private static let minorDivisions = 2

    var body: some View {
        RailSliderView(
            minIndex: Self.minDay,
            maxIndex: Self.maxDay,
            minorDivisions: Self.minorDivisions,
            currentIndex: viewModel.selectedDayOffset,
            label: { viewModel.dayLabel(offset: $0) },
            onCommit: { viewModel.commitDay($0) }
        )
    }
}