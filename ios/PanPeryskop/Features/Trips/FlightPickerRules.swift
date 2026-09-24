import Foundation

enum FlightPickerRules {
    /// A departure inside the last `leadDays` of a month is too late for a trip,
    /// so the calendar moves on to the next month.
    static let leadDays = 3

    static func nights(from: String, to: String) -> Int? {
        guard let start = AppConstants.isoDayFormatter.date(from: from),
              let end = AppConstants.isoDayFormatter.date(from: to) else { return nil }
        return AppConstants.warsawCalendar.dateComponents([.day], from: start, to: end).day
    }

    static func isReturnAllowed(_ day: String, after outbound: String, maxNights: Int) -> Bool {
        guard let nights = nights(from: outbound, to: day) else { return false }
        return nights >= 1 && nights <= maxNights
    }

    static func shouldClearReturn(outbound: String?, returning: String?, maxNights: Int) -> Bool {
        guard let returning else { return false }
        guard let outbound else { return true }
        return !isReturnAllowed(returning, after: outbound, maxNights: maxNights)
    }

    static func latestReturn(after outbound: String, maxNights: Int) -> String? {
        guard let start = AppConstants.isoDayFormatter.date(from: outbound),
              let end = AppConstants.warsawCalendar.date(byAdding: .day, value: maxNights, to: start) else { return nil }
        return AppConstants.isoDayFormatter.string(from: end)
    }

    /// The month the outbound calendar opens on. It follows today: a day in the
    /// last `leadDays` of the month is too late, so it moves to the next month.
    static func openingMonth(now: Date) -> Date {
        advance(monthStart(now), day: now, by: leadDays)
    }

    /// The month the return calendar follows for a departure: the departure's own
    /// month, or the next one when the departure sits in the last `leadDays` of it
    /// (so a multi-day trip still fits).
    static func returnMonth(after outbound: String) -> Date? {
        guard let date = AppConstants.isoDayFormatter.date(from: outbound) else { return nil }
        return advance(monthStart(date), day: date, by: leadDays)
    }

    static func monthStart(_ date: Date) -> Date {
        let calendar = AppConstants.warsawCalendar
        return calendar.date(from: calendar.dateComponents([.year, .month], from: date)) ?? date
    }

    private static func advance(_ monthStart: Date, day: Date, by leadDays: Int) -> Date {
        let calendar = AppConstants.warsawCalendar
        let days = calendar.range(of: .day, in: .month, for: monthStart)?.count ?? 28
        guard calendar.component(.day, from: day) > days - leadDays else { return monthStart }
        return calendar.date(byAdding: .month, value: 1, to: monthStart) ?? monthStart
    }
}
