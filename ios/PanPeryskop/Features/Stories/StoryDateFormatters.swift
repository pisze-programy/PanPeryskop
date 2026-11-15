import Foundation

enum EventDateFormatter {
    private static let weekdayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "pl_PL")
        f.timeZone = AppConstants.warsawTimeZone
        f.dateFormat = "EEEE"
        return f
    }()

    static func eventDay(_ ms: Int64) -> String {
        let date = Date(timeIntervalSince1970: TimeInterval(ms) / 1000)
        let calendar = AppConstants.warsawCalendar
        let day = calendar.startOfDay(for: date)
        let today = calendar.startOfDay(for: Date())
        let diff = calendar.dateComponents([.day], from: today, to: day).day ?? 0
        if let relative = DayLabels.relative(offset: diff) { return relative }
        guard diff != 2 else { return "Pojutrze" }
        return weekdayFormatter.string(from: date)
    }
}
