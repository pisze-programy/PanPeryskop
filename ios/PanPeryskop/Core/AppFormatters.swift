import Foundation

// Cached date formatters (DateFormatter creation is expensive — reuse).
extension AppConstants {
    static let isoDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = warsawCalendar
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static let shortDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = warsawCalendar
        f.locale = Locale(identifier: "pl_PL")
        f.dateFormat = "dd.MM"
        return f
    }()

    static let weekdayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = warsawCalendar
        f.locale = Locale(identifier: "pl_PL")
        f.dateFormat = "EEE"
        return f
    }()

    static let fullDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = warsawCalendar
        f.locale = Locale(identifier: "pl_PL")
        f.dateFormat = "d MMM yyyy"
        return f
    }()

    static let hourFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = warsawCalendar
        f.dateFormat = "HH:mm"
        return f
    }()
}