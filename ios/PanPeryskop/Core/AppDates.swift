import Foundation

// Date/time primitives shared across the app.
extension AppConstants {
    /// App wall-clock zone — single source for every date/time.
    static let warsawTimeZone: TimeZone = TimeZone(identifier: "Europe/Warsaw")!

    /// Gregorian calendar in the Warsaw zone.
    static let warsawCalendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = warsawTimeZone
        return c
    }()
}