import SwiftUI

struct DaySliderView: View {
    @ObservedObject var viewModel: MapViewModel

    private static let minDay = MapViewModel.minDayOffset
    private static let maxDay = MapViewModel.maxDayOffset
    private static let minorDivisions = 3
    private static let weekdayAbbrev = ["Nd", "Pon", "Wt", "Śr", "Czw", "Pt", "Sob"]

    private func weekdayLabel(for offset: Int) -> String {
        let calendar = AppConstants.warsawCalendar
        let date = calendar.date(byAdding: .day, value: offset, to: Date()) ?? Date()
        let weekday = calendar.component(.weekday, from: date)
        guard (1...Self.weekdayAbbrev.count).contains(weekday) else { return "" }
        return Self.weekdayAbbrev[weekday - 1]
    }

    var body: some View {
        RailSliderView(
            minIndex: Self.minDay,
            maxIndex: Self.maxDay,
            minorDivisions: Self.minorDivisions,
            currentIndex: viewModel.selectedDayOffset,
            label: { weekdayLabel(for: $0) },
            onCommit: { viewModel.commitDay($0) }
        )
    }
}