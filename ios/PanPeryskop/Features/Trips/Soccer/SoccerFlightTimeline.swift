import SwiftUI

/// One horizontal flight timeline: outbound days on the left, the event day in the
/// middle (highlighted), return days on the right. Tap a left day to pick the
/// outbound, a right day to pick the return — a single axis, not two rows.
struct SoccerFlightTimeline: View {
    let window: FlightWindowResponse
    let eventDay: Int64
    @Binding var selectedOutbound: FlightWindowCell?
    @Binding var selectedReturn: FlightWindowCell?
    let best: FlightPair?

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(window.outbound, id: \.date) { cell in
                        dayCell(cell, isOutbound: true)
                    }
                    eventMarker.id(Self.markerId)
                    ForEach(window.returning, id: \.date) { cell in
                        dayCell(cell, isOutbound: false)
                    }
                }
                .padding(.horizontal, Theme.Spacing.xs)
                .padding(.vertical, Theme.Spacing.xs)
            }
            .onAppear { proxy.scrollTo(Self.markerId, anchor: .center) }
            .onChange(of: window.outbound.first?.date) { _, _ in
                proxy.scrollTo(Self.markerId, anchor: .center)
            }
        }
    }

    private static let markerId = "flight-event-marker"

    private func dayCell(_ cell: FlightWindowCell, isOutbound: Bool) -> some View {
        let disabled = cell.price == nil
        let selected = isOutbound
            ? selectedOutbound?.date == cell.date
            : selectedReturn?.date == cell.date
        let best = isBest(cell, isOutbound: isOutbound)
        return Button {
            if isOutbound { selectedOutbound = cell } else { selectedReturn = cell }
        } label: {
            VStack(spacing: 1) {
                Text(Self.shortDay(cell.date))
                    .font(.caption2.weight(.semibold))
                Text(Self.weekday(cell.date))
                    .font(.system(size: 9))
                    .foregroundColor(.secondary)
                Text(cell.hour ?? "—")
                    .font(.system(size: 10))
                Text(priceLabel(cell))
                    .font(.caption2.weight(.bold))
                    .foregroundColor(cell.price == nil ? .secondary : .primary)
            }
            .padding(.top, 7)
            .frame(width: 56, height: 66)
            .background(selected ? Color.accentColor.opacity(0.18) : Color(.systemGray6), in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(selected ? Color.accentColor : (best ? Color.orange : Color.clear), lineWidth: selected || best ? 2 : 0))
            .overlay(alignment: .top) {
                if best {
                    Image(systemName: "star.fill")
                        .font(.system(size: 8))
                        .foregroundColor(.orange)
                }
            }
            .opacity(disabled ? 0.4 : 1)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }

    private var eventMarker: some View {
        VStack(spacing: 2) {
            Image(systemName: "sportscourt.fill")
                .font(.caption2)
            Text("MECZ")
                .font(.system(size: 8, weight: .heavy))
            Text(Self.shortDay(Self.dayKey(eventDay)))
                .font(.system(size: 9, weight: .bold))
        }
        .foregroundColor(.purple)
        .frame(width: 56, height: 66)
        .background(Color.purple.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.purple, lineWidth: 2))
    }

    private func isBest(_ cell: FlightWindowCell, isOutbound: Bool) -> Bool {
        guard let best else { return false }
        return isOutbound ? best.outbound.date == Self.date(from: cell.date) : best.returning.date == Self.date(from: cell.date)
    }

    private func priceLabel(_ cell: FlightWindowCell) -> String {
        guard let price = cell.price else { return "brak" }
        return "\(Int(price)) zł"
    }

    static func dayKey(_ ms: Int64) -> String {
        AppConstants.isoDayFormatter.string(from: Date(timeIntervalSince1970: TimeInterval(ms) / 1000))
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
        return AppConstants.weekdayFullFormatter.string(from: d)
    }
}