import SwiftUI

/// Two-row day grid (outbound top, return bottom) — run-club style. Row headers
/// show origin → destination; cells show dd.MM, weekday, hour, price. Event-day
/// cells get a purple border, the best pair gets an amber star.
struct FlightGrid: View {
    let window: FlightWindowResponse
    let eventDay: Int64
    let originName: String
    let destinationName: String
    @Binding var selectedOutbound: FlightWindowCell?
    @Binding var selectedReturn: FlightWindowCell?
    let best: FlightPair?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            dayRow(title: "\(originName) ✈ \(destinationName)", cells: window.outbound, selection: $selectedOutbound, isOutbound: true)
            dayRow(title: "\(destinationName) ✈ \(originName)", cells: window.returning, selection: $selectedReturn, isOutbound: false)
        }
    }

    private func dayRow(title: String, cells: [FlightWindowCell], selection: Binding<FlightWindowCell?>, isOutbound: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption.weight(.bold))
                .foregroundColor(.secondary)
                .lineLimit(1)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(cells, id: \.date) { cell in
                        FlightDayCell(
                            cell: cell,
                            isEventDay: isEventDay(cell.date),
                            isBest: isBestPair(cell, isOutbound: isOutbound),
                            isSelected: selection.wrappedValue?.date == cell.date,
                            isDisabled: cell.price == nil
                        ) {
                            selection.wrappedValue = cell
                        }
                    }
                }
            }
        }
    }

    private func isEventDay(_ date: String) -> Bool {
        date == Self.dayKey(Date(timeIntervalSince1970: TimeInterval(eventDay) / 1000))
    }

    private func isBestPair(_ cell: FlightWindowCell, isOutbound: Bool) -> Bool {
        guard let best else { return false }
        return isOutbound
            ? best.outbound.date == Self.date(from: cell.date)
            : best.returning.date == Self.date(from: cell.date)
    }

    static func dayKey(_ date: Date) -> String {
        AppConstants.isoDayFormatter.string(from: date)
    }

    static func date(from dateStr: String) -> Date? {
        AppConstants.isoDayFormatter.date(from: dateStr)
    }

    static func shortDay(_ dateStr: String) -> String {
        guard let d = date(from: dateStr) else { return dateStr }
        return AppConstants.shortDayFormatter.string(from: d)
    }

    static func weekday(_ dateStr: String) -> String {
        guard let d = date(from: dateStr) else { return "" }
        return AppConstants.weekdayFormatter.string(from: d)
    }
}

struct FlightDayCell: View {
    let cell: FlightWindowCell
    let isEventDay: Bool
    let isBest: Bool
    let isSelected: Bool
    let isDisabled: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 1) {
                Text(FlightGrid.shortDay(cell.date))
                    .font(.caption2.weight(.semibold))
                Text(FlightGrid.weekday(cell.date))
                    .font(.system(size: 9))
                    .foregroundColor(.secondary)
                Text(cell.hour ?? "—")
                    .font(.system(size: 10))
                Text(priceLabel)
                    .font(.caption2.weight(.bold))
                    .foregroundColor(priceColor)
            }
            .frame(width: 56, height: 58)
            .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(borderColor, lineWidth: isEventDay || isBest || isSelected ? 2 : 0))
            .overlay(alignment: .top) {
                if isBest {
                    Image(systemName: "star.fill")
                        .font(.system(size: 8))
                        .foregroundColor(.orange)
                }
            }
            .opacity(isDisabled ? 0.4 : 1)
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
    }

    private var priceLabel: String {
        guard let price = cell.price else { return "brak" }
        return "\(Int(price)) zł"
    }
    private var priceColor: Color { cell.price == nil ? .secondary : .primary }
    private var borderColor: Color {
        if isEventDay { return .purple }
        if isBest { return .orange }
        if isSelected { return Color.accentColor }
        return .clear
    }
}

extension Airline {
    var label: String {
        switch self {
        case .ryanair: return "Ryanair"
        case .wizzair: return "Wizzair"
        }
    }
}

extension FlightWindowCell {
    var cell: FlightCell? {
        guard let price, let date = FlightGrid.date(from: date) else { return nil }
        return FlightCell(date: date, hour: hour, price: price)
    }
}