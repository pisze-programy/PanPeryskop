import SwiftUI

struct FlightTimeline: View {
    let window: FlightWindowResponse
    let eventDay: Int64
    var eventHour: String? = nil
    var markerIcon: String = "sportscourt.fill"
    var markerLabel: String = "MECZ"
    @Binding var selectedOutbound: FlightWindowCell?
    @Binding var selectedReturn: FlightWindowCell?
    let best: FlightPair?

    private static let markerId = "flight-event-marker"
    static let cellWidth: CGFloat = 56
    static let cellHeight: CGFloat = 66
    static let cellSpacing: CGFloat = 6
    private static let cellLineSpacing: CGFloat = 1
    private static let markerLineSpacing: CGFloat = 2
    private static let cellCornerRadius: CGFloat = 8
    private static let selectionBorderWidth: CGFloat = 2
    private static let disabledOpacity: Double = 0.4
    private static let selectedBackgroundOpacity: Double = 0.18
    private static let markerBackgroundOpacity: Double = 0.12
    private static let weekdaySize: CGFloat = 9
    private static let timeSize: CGFloat = 10
    private static let markerLabelSize: CGFloat = 8
    private static let markerDaySize: CGFloat = 9
    private static let topPadding: CGFloat = 7
    private static let bestStarSize: CGFloat = 8
    private static let missingValue = "—"
    private static let millisecondsPerSecond = 1000.0

    var body: some View {
        let bestOutboundDay = best.map { Self.dayString($0.outbound.date) }
        let bestReturnDay = best.map { Self.dayString($0.returning.date) }
        let todayKey = Self.todayDayKey()
        return ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Self.cellSpacing) {
                    ForEach(window.outbound, id: \.date) { cell in
                        dayCell(cell, isOutbound: true, highlightedDay: bestOutboundDay, todayKey: todayKey)
                    }
                    eventMarker.id(Self.markerId)
                    ForEach(window.returning, id: \.date) { cell in
                        dayCell(cell, isOutbound: false, highlightedDay: bestReturnDay, todayKey: todayKey)
                    }
                }
                .padding(.vertical, Theme.Spacing.xs)
            }
            .onAppear { proxy.scrollTo(Self.markerId, anchor: .center) }
            .onChange(of: window.outbound.first?.date) { _, _ in
                proxy.scrollTo(Self.markerId, anchor: .center)
            }
        }
    }

    private func dayCell(
        _ cell: FlightWindowCell,
        isOutbound: Bool,
        highlightedDay: String?,
        todayKey: String
    ) -> some View {
        let selected = isSelected(cell, isOutbound: isOutbound)
        let highlighted = cell.date == highlightedDay
        return Button {
            toggle(cell, isOutbound: isOutbound)
        } label: {
            dayCellLabel(cell, selected: selected, highlighted: highlighted, todayKey: todayKey)
        }
        .buttonStyle(.plain)
        .disabled(cell.price == nil)
    }

    private func dayCellLabel(
        _ cell: FlightWindowCell,
        selected: Bool,
        highlighted: Bool,
        todayKey: String
    ) -> some View {
        VStack(spacing: Self.cellLineSpacing) {
            Text(Self.shortDay(cell.date))
                .font(.caption2.weight(.semibold))
            weekdayText(cell, todayKey: todayKey)
            Text(cell.hour ?? Self.missingValue)
                .font(.system(size: Self.timeSize))
            Text(priceLabel(cell))
                .font(.caption2.weight(.bold))
                .foregroundColor(cell.price == nil ? .secondary : .primary)
        }
        .padding(.top, Self.topPadding)
        .frame(width: Self.cellWidth, height: Self.cellHeight)
        .background(background(selected: selected), in: cellShape)
        .overlay(cellBorder(selected: selected, highlighted: highlighted))
        .overlay(alignment: .top) { bestStar(highlighted: highlighted) }
        .opacity(cell.price == nil ? Self.disabledOpacity : 1)
    }

    private var cellShape: RoundedRectangle {
        RoundedRectangle(cornerRadius: Self.cellCornerRadius)
    }

    private func background(selected: Bool) -> Color {
        selected ? Color.accentColor.opacity(Self.selectedBackgroundOpacity) : Theme.Palette.surface
    }

    @ViewBuilder
    private func cellBorder(selected: Bool, highlighted: Bool) -> some View {
        if selected || highlighted {
            cellShape.stroke(borderColor(selected: selected, highlighted: highlighted), lineWidth: Self.selectionBorderWidth)
        }
    }

    private func borderColor(selected: Bool, highlighted: Bool) -> Color {
        if selected { return .accentColor }
        return highlighted ? .orange : .clear
    }

    @ViewBuilder
    private func bestStar(highlighted: Bool) -> some View {
        if highlighted {
            Image(systemName: "star.fill")
                .font(.system(size: Self.bestStarSize))
                .foregroundColor(.orange)
        }
    }

    private func weekdayText(_ cell: FlightWindowCell, todayKey: String) -> some View {
        let today = cell.date == todayKey
        return Text(today ? "dziś" : Self.weekday(cell.date))
            .font(.system(size: Self.weekdaySize))
            .foregroundColor(today ? .accentColor : .secondary)
    }

    private var eventMarker: some View {
        VStack(spacing: Self.markerLineSpacing) {
            Image(systemName: markerIcon)
                .font(.caption2)
            Text(markerLabel)
                .font(.system(size: Self.markerLabelSize, weight: .heavy))
            Text(Self.shortDay(Self.dayKey(eventDay)))
                .font(.system(size: Self.markerDaySize, weight: .bold))
            Text(eventHour ?? Self.missingValue)
                .font(.system(size: Self.timeSize))
        }
        .foregroundColor(.purple)
        .frame(width: Self.cellWidth, height: Self.cellHeight)
        .background(Color.purple.opacity(Self.markerBackgroundOpacity), in: cellShape)
        .overlay(cellShape.stroke(Color.purple, lineWidth: Self.selectionBorderWidth))
    }

    private func isSelected(_ cell: FlightWindowCell, isOutbound: Bool) -> Bool {
        isOutbound ? selectedOutbound?.date == cell.date : selectedReturn?.date == cell.date
    }

    private func toggle(_ cell: FlightWindowCell, isOutbound: Bool) {
        let isDeselecting = isSelected(cell, isOutbound: isOutbound)
        let newValue = isDeselecting ? nil : cell
        if isOutbound {
            selectedOutbound = newValue
        } else {
            selectedReturn = newValue
        }
    }

    private static func todayDayKey() -> String {
        dayString(Date())
    }

    private static func dayString(_ date: Date) -> String {
        AppConstants.isoDayFormatter.string(from: date)
    }

    private func priceLabel(_ cell: FlightWindowCell) -> String {
        guard let price = cell.price else { return "brak" }
        return "\(Int(price)) zł"
    }

    static func dayKey(_ ms: Int64) -> String {
        dayString(Date(timeIntervalSince1970: TimeInterval(ms) / millisecondsPerSecond))
    }

    static func date(from dateString: String) -> Date? {
        AppConstants.isoDayFormatter.date(from: dateString)
    }

    static func shortDay(_ dateString: String) -> String {
        guard let date = date(from: dateString) else { return dateString }
        return AppConstants.shortDayFormatter.string(from: date)
    }

    static func weekday(_ dateString: String) -> String {
        guard let date = date(from: dateString) else { return "" }
        return AppConstants.weekdayFullFormatter.string(from: date)
    }
}
