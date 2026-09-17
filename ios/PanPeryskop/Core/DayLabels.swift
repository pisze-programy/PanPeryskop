import Foundation

enum DayLabels {
    static func date(offset: Int) -> Date {
        AppConstants.warsawCalendar.date(byAdding: .day, value: offset, to: Date()) ?? Date()
    }

    static func relative(offset: Int) -> String? {
        switch offset {
        case 0: return "Dziś"
        case 1: return "Jutro"
        default: return nil
        }
    }

    static func title(offset: Int) -> String {
        if let relative = relative(offset: offset) { return relative }
        let date = date(offset: offset)
        let day = AppConstants.dayMonthFormatter.string(from: date)
        let weekday = AppConstants.weekdayFullFormatter.string(from: date).capitalized
        return "\(day), \(weekday)"
    }

    static func short(offset: Int) -> String {
        AppConstants.shortDayFormatter.string(from: date(offset: offset))
    }

    static func pill(offset: Int) -> String {
        relative(offset: offset) ?? short(offset: offset)
    }

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