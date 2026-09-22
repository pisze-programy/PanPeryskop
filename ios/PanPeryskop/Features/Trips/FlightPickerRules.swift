import Foundation

enum FlightPickerRules {
    static func nights(from: String, to: String) -> Int? {
        guard let start = AppConstants.isoDayFormatter.date(from: from),
              let end = AppConstants.isoDayFormatter.date(from: to) else { return nil }
        return AppConstants.warsawCalendar.dateComponents([.day], from: start, to: end).day
    }

    static func isReturnAllowed(_ day: String, after outbound: String, maxNights: Int) -> Bool {
        guard let nights = nights(from: outbound, to: day) else { return false }
        return nights >= 1 && nights <= maxNights
    }

    static func latestReturn(after outbound: String, maxNights: Int) -> String? {
        guard let start = AppConstants.isoDayFormatter.date(from: outbound),
              let end = AppConstants.warsawCalendar.date(byAdding: .day, value: maxNights, to: start) else { return nil }
        return AppConstants.isoDayFormatter.string(from: end)
    }

    static func openingMonth(now: Date, maxNights: Int) -> Date {
        let calendar = AppConstants.warsawCalendar
        let start = monthStart(now)
        let days = calendar.range(of: .day, in: .month, for: start)?.count ?? 28
        guard calendar.component(.day, from: now) > days - maxNights else { return start }
        return calendar.date(byAdding: .month, value: 1, to: start) ?? start
    }

    static func monthStart(_ date: Date) -> Date {
        let calendar = AppConstants.warsawCalendar
        return calendar.date(from: calendar.dateComponents([.year, .month], from: date)) ?? date
    }
}
