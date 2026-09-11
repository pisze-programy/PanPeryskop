import SwiftUI

enum StoryDateFormatter {
    static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "pl_PL")
        f.dateFormat = "d MMM HH:mm"
        return f
    }()

    static func format(_ ms: Int64) -> String {
        formatter.string(from: Date(timeIntervalSince1970: TimeInterval(ms) / 1000))
    }
}

/// Event day (the seed anchor is 06:00 Europe/Warsaw of the event date) — shown
/// as a small label above the flip-clock time. Relative for the current window
/// (Dziś/Jutro/Pojutrze), otherwise the full weekday name (no DD/MM).
enum EventDateFormatter {
    private static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Warsaw")!
        return c
    }()

    private static let weekdayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "pl_PL")
        f.timeZone = TimeZone(identifier: "Europe/Warsaw")
        f.dateFormat = "EEEE"
        return f
    }()

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "pl_PL")
        f.timeZone = TimeZone(identifier: "Europe/Warsaw")
        f.dateFormat = "HH:mm"
        return f
    }()

    static func eventDay(_ ms: Int64) -> String {
        let date = Date(timeIntervalSince1970: TimeInterval(ms) / 1000)
        let day = calendar.startOfDay(for: date)
        let today = calendar.startOfDay(for: Date())
        let diff = calendar.dateComponents([.day], from: today, to: day).day ?? 0
        switch diff {
        case 0: return "Dziś"
        case 1: return "Jutro"
        case 2: return "Pojutrze"
        default: return weekdayFormatter.string(from: date)
        }
    }

    static func time(_ ms: Int64) -> String {
        timeFormatter.string(from: Date(timeIntervalSince1970: TimeInterval(ms) / 1000))
    }
}
