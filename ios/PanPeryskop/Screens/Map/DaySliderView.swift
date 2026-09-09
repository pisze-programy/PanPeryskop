import SwiftUI

/// Day picker (events) — thin wrapper over the shared RailSliderView. Weekday label
/// (Pon..Nd) above, 0…5 days, 3 minor divisions.
struct DaySliderView: View {
    @ObservedObject var viewModel: MapViewModel

    private static let minDay = 0
    private static let maxDay = 5
    private static let minorDivisions = 3

    // Calendar.weekday: 1 = Sunday … 7 = Saturday.
    private let weekdayAbbrev = ["Nd", "Pon", "Wt", "Śr", "Czw", "Pt", "Sob"]

    private var selectedDate: Date {
        Calendar.current.date(byAdding: .day, value: viewModel.selectedDayOffset, to: Date()) ?? Date()
    }
    private var weekdayLabel: String {
        weekdayAbbrev[Calendar.current.component(.weekday, from: selectedDate) - 1]
    }

    var body: some View {
        RailSliderView(
            minIndex: Self.minDay,
            maxIndex: Self.maxDay,
            minorDivisions: Self.minorDivisions,
            currentIndex: viewModel.selectedDayOffset,
            label: { _ in weekdayLabel },
            onCommit: { viewModel.commitDay($0) }
        )
    }
}