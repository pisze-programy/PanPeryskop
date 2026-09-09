import SwiftUI

/// Week picker (Wycieczki) — thin wrapper over the shared RailSliderView.
/// 0…12 weeks (≈3 months), label "DD.MM – DD.MM" of the week's Monday–Sunday.
struct WeekSliderView: View {
    @ObservedObject var viewModel: TripsViewModel

    private static let minWeek = 0
    private static let maxWeek = 12
    private static let minorDivisions = 2

    var body: some View {
        RailSliderView(
            minIndex: Self.minWeek,
            maxIndex: Self.maxWeek,
            minorDivisions: Self.minorDivisions,
            currentIndex: viewModel.selectedWeekOffset,
            label: { viewModel.weekStartLabel(offset: $0) },
            bottomLabel: { viewModel.weekEndLabel(offset: $0) },
            onCommit: { viewModel.commitWeek($0) }
        )
    }
}