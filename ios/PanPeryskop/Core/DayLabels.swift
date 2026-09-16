import Foundation

/// Shared day-browser labels for events and trips.
enum DayLabels {
    static func date(offset: Int) -> Date {
        AppConstants.warsawCalendar.date(byAdding: .day, value: offset, to: Date()) ?? Date()
    }

    /// "Dziś", "Jutro", else the day with the month name and the weekday
    /// ("1 listopada, Czwartek").
    static func title(offset: Int) -> String {
        if offset == 0 { return "Dziś" }
        if offset == 1 { return "Jutro" }
        let date = date(offset: offset)
        let day = AppConstants.dayMonthFormatter.string(from: date)
        let weekday = AppConstants.weekdayFullFormatter.string(from: date).capitalized
        return "\(day), \(weekday)"
    }

    /// "DD.MM" — for the rail slider.
    static func short(offset: Int) -> String {
        AppConstants.shortDayFormatter.string(from: date(offset: offset))
    }

    /// "Wrzesień 2026" — month section header for the day sheet.
    static func monthTitle(offset: Int) -> String {
        AppConstants.monthYearFormatter.string(from: date(offset: offset)).capitalized
    }
}

/// Persisted day choice: stored as an absolute date so a past day falls back to
/// today when the app opens on a later day.
enum StoredDay {
    static func loadOffset(key: String) -> Int? {
        guard let iso = UserDefaults.standard.string(forKey: key),
              let stored = AppConstants.isoDayFormatter.date(from: iso)
        else { return nil }
        let calendar = AppConstants.warsawCalendar
        let today = calendar.startOfDay(for: Date())
        let days = calendar.dateComponents([.day], from: today, to: calendar.startOfDay(for: stored)).day ?? 0
        return days >= 0 ? days : nil
    }

    static func save(offset: Int, key: String) {
        let iso = AppConstants.isoDayFormatter.string(from: DayLabels.date(offset: offset))
        UserDefaults.standard.set(iso, forKey: key)
    }
}
