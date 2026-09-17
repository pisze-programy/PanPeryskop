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

    /// Full weekday name in Polish (e.g. "sobota") — no trailing dot.
    static let weekdayFullFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = warsawCalendar
        f.locale = Locale(identifier: "pl_PL")
        f.dateFormat = "EEEE"
        return f
    }()

    /// "d MMMM" — day with the month name in the genitive (e.g. "1 listopada").
    static let dayMonthFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = warsawCalendar
        f.locale = Locale(identifier: "pl_PL")
        f.dateFormat = "d MMMM"
        return f
    }()

    /// "11" — day number only.
    static let dayOnlyFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = warsawCalendar
        f.locale = Locale(identifier: "pl_PL")
        f.dateFormat = "d"
        return f
    }()

    static let fullDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = warsawCalendar
        f.locale = Locale(identifier: "pl_PL")
        f.dateFormat = "d MMM yyyy"
        return f
    }()

    /// "LLLL yyyy" — month section header (e.g. "wrzesień 2026").
    static let monthYearFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = warsawCalendar
        f.locale = Locale(identifier: "pl_PL")
        f.dateFormat = "LLLL yyyy"
        return f
    }()

    static let hourFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = warsawCalendar
        f.dateFormat = "HH:mm"
        return f
    }()
}