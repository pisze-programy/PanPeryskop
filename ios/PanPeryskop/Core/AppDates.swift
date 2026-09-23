import Foundation

// Date/time primitives shared across the app.
extension AppConstants {
    /// App wall-clock zone — single source for every date/time.
    static let warsawTimeZone: TimeZone = TimeZone(identifier: "Europe/Warsaw")!

    /// Gregorian calendar in the Warsaw zone. The week starts on Monday, whatever
    /// the device region says: the app is Polish and a Sunday-first grid would
    /// disagree with every date label it shows.
    static let warsawCalendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = warsawTimeZone
        c.firstWeekday = 2
        return c
    }()
}