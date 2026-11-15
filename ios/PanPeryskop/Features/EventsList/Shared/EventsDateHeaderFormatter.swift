import Foundation

enum EventsDateHeaderFormatter {
    private static let isoDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = AppConstants.warsawCalendar
        f.timeZone = AppConstants.warsawTimeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let dayMonthFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = AppConstants.warsawCalendar
        f.timeZone = AppConstants.warsawTimeZone
        f.locale = Locale(identifier: "pl_PL")
        f.dateFormat = "d MMMM"
        return f
    }()

    private static let weekdayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = AppConstants.warsawCalendar
        f.timeZone = AppConstants.warsawTimeZone
        f.locale = Locale(identifier: "pl_PL")
        f.dateFormat = "EEEE"
        return f
    }()

    static func title(for date: Date, now: Date = Date()) -> String {
        let calendar = AppConstants.warsawCalendar
        let targetDay = calendar.startOfDay(for: date)
        let today = calendar.startOfDay(for: now)
        let diff = calendar.dateComponents([.day], from: today, to: targetDay).day ?? 0
        let dayMonth = dayMonthFormatter.string(from: date)
        switch diff {
        case 0:
            return "Dziś, \(dayMonth)"
        case 1:
            return "Jutro, \(dayMonth)"
        default:
            let weekday = weekdayFormatter.string(from: date).capitalized
            return "\(weekday), \(dayMonth)"
        }
    }

    static func title(isoDay: String, now: Date = Date()) -> String {
        guard let date = isoDayFormatter.date(from: isoDay) else { return isoDay }
        return title(for: date, now: now)
    }

    static func title(dayOffset: Int, now: Date = Date()) -> String {
        let calendar = AppConstants.warsawCalendar
        let today = calendar.startOfDay(for: now)
        let date = calendar.date(byAdding: .day, value: dayOffset, to: today) ?? now
        return title(for: date, now: now)
    }
}
