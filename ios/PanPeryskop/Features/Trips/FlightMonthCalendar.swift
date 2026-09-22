import SwiftUI

struct FlightMonthCalendar: View {
    let title: String
    let cells: [FlightWindowCell]
    let month: Date
    let minMonth: Date
    let maxMonth: Date
    @Binding var selected: FlightWindowCell?
    let disabledThrough: String?
    var disabledAfter: String? = nil
    let onMonthChange: (Date) -> Void

    @Environment(\.colorScheme) private var colorScheme

    private static let columnCount = 7
    private static let cellHeight: CGFloat = 56
    private static let cellRadius: CGFloat = 8

    private static let weekdaySymbols: [String] = {
        var calendar = AppConstants.warsawCalendar
        calendar.locale = Locale(identifier: "pl_PL")
        let symbols = calendar.veryShortWeekdaySymbols
        let first = calendar.firstWeekday - 1
        return (0..<7).map { symbols[(first + $0) % 7].uppercased() }
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            header
            weekdayHeader
            grid
        }
    }

    private var header: some View {
        HStack(spacing: Theme.Spacing.s) {
            Text(title)
                .font(.subheadline.weight(.semibold))
            Spacer(minLength: 0)
            arrow("chevron.left", enabled: canGoBack) { shift(-1) }
            Text(AppConstants.monthYearFormatter.string(from: month))
                .font(.subheadline.weight(.bold))
                .frame(minWidth: 118)
            arrow("chevron.right", enabled: canGoForward) { shift(1) }
        }
        .padding(.horizontal, Theme.Spacing.l)
    }

    private func arrow(_ systemName: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.selection()
            action()
        } label: {
            Image(systemName: systemName)
                .font(.subheadline.weight(.bold))
                .frame(width: 32, height: 32)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.3)
    }

    private var weekdayHeader: some View {
        LazyVGrid(columns: columns, spacing: 0) {
            ForEach(Array(Self.weekdaySymbols.enumerated()), id: \.offset) { _, symbol in
                Text(symbol)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, Theme.Spacing.s)
    }

    private var grid: some View {
        LazyVGrid(columns: columns, spacing: 4) {
            ForEach(Array(slots.enumerated()), id: \.offset) { _, slot in
                daySlot(slot)
            }
        }
        .padding(.horizontal, Theme.Spacing.s)
    }

    private var columns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 4), count: Self.columnCount)
    }

    @ViewBuilder
    private func daySlot(_ cell: FlightWindowCell?) -> some View {
        if let cell {
            dayCell(cell)
        } else {
            Color.clear.frame(height: Self.cellHeight)
        }
    }

    private func dayCell(_ cell: FlightWindowCell) -> some View {
        let hasPrice = cell.price != nil
        let isSelected = selected?.date == cell.date
        let isDisabled = (disabledThrough.map { cell.date <= $0 } ?? false)
            || (disabledAfter.map { cell.date > $0 } ?? false)
        let isPickable = hasPrice && !isDisabled
        return Button {
            selected = isSelected ? nil : cell
        } label: {
            VStack(spacing: 1) {
                Text(dayNumber(cell.date))
                    .font(.system(size: 11, weight: .semibold))
                Text(cell.hour ?? "—")
                    .font(.system(size: 8))
                    .foregroundColor(.secondary)
                Text(priceLabel(cell))
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(hasPrice ? priceColor(cell.price ?? 0) : .secondary)
            }
            .frame(maxWidth: .infinity, minHeight: Self.cellHeight)
            .background(background(isSelected: isSelected), in: shape)
            .overlay(shape.stroke(borderColor(isSelected: isSelected), lineWidth: 1.5))
            .opacity(isPickable ? 1 : 0.35)
        }
        .buttonStyle(.plain)
        .disabled(!isPickable)
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: Self.cellRadius, style: .continuous)
    }

    private func background(isSelected: Bool) -> Color {
        isSelected ? Color.accentColor.opacity(0.18) : Theme.Palette.surface
    }

    private func borderColor(isSelected: Bool) -> Color {
        isSelected ? .accentColor : .clear
    }

    private var monthStart: Date { Self.startOfMonth(month) }
    private var minMonthStart: Date { Self.startOfMonth(minMonth) }
    private var maxMonthStart: Date { Self.startOfMonth(maxMonth) }

    private var canGoBack: Bool { monthStart > minMonthStart }
    private var canGoForward: Bool { monthStart < maxMonthStart }

    private func shift(_ months: Int) {
        guard let next = AppConstants.warsawCalendar.date(byAdding: .month, value: months, to: monthStart) else { return }
        onMonthChange(next)
    }

    private static func startOfMonth(_ date: Date) -> Date {
        let calendar = AppConstants.warsawCalendar
        return calendar.date(from: calendar.dateComponents([.year, .month], from: date)) ?? date
    }

    private var slots: [FlightWindowCell?] {
        let calendar = AppConstants.warsawCalendar
        let days = calendar.range(of: .day, in: .month, for: monthStart) ?? 1..<1
        let leading = (calendar.component(.weekday, from: monthStart) - calendar.firstWeekday + 7) % 7
        let byDate = Dictionary(cells.map { ($0.date, $0) }, uniquingKeysWith: { first, _ in first })
        var out: [FlightWindowCell?] = Array(repeating: nil, count: leading)
        for offset in 0..<days.count {
            guard let date = calendar.date(byAdding: .day, value: offset, to: monthStart) else { continue }
            let key = AppConstants.isoDayFormatter.string(from: date)
            out.append(byDate[key] ?? FlightWindowCell(date: key, hour: nil, price: nil))
        }
        return out
    }

    private func dayNumber(_ isoDay: String) -> String {
        guard let date = AppConstants.isoDayFormatter.date(from: isoDay) else { return "" }
        return AppConstants.dayOnlyFormatter.string(from: date)
    }

    private func priceLabel(_ cell: FlightWindowCell) -> String {
        guard let price = cell.price else { return "—" }
        return "\(Int(price))"
    }

    private var priceRange: (min: Double, max: Double)? {
        let prices = cells.compactMap(\.price)
        guard let low = prices.min(), let high = prices.max(), high > low else { return nil }
        return (low, high)
    }

    private func priceColor(_ price: Double) -> Color {
        guard let range = priceRange else { return Theme.Palette.priceMid(colorScheme) }
        let ratio = (price - range.min) / (range.max - range.min)
        if ratio <= 0.33 { return Theme.Palette.priceLow(colorScheme) }
        if ratio <= 0.66 { return Theme.Palette.priceMid(colorScheme) }
        return Theme.Palette.priceHigh(colorScheme)
    }
}
