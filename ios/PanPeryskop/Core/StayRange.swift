import Foundation

enum StayRange {
    static func nights(from checkin: String, to checkout: String) -> Int {
        guard let start = day(checkin), let end = day(checkout) else { return 1 }
        let count = AppConstants.warsawCalendar.dateComponents([.day], from: start, to: end).day ?? 1
        return max(1, count)
    }

    static func label(from checkin: String, to checkout: String) -> String {
        let count = nights(from: checkin, to: checkout)
        return "\(count) \(nightsWord(count)), \(dates(checkin, checkout))"
    }

    static func totalPriceLabel(from checkin: String, to checkout: String) -> String {
        "Za całość (\(label(from: checkin, to: checkout)))"
    }

    private static func dates(_ checkin: String, _ checkout: String) -> String {
        guard let start = day(checkin), let end = day(checkout) else { return "" }
        let endText = AppConstants.dayMonthFormatter.string(from: end)
        let sameMonth = AppConstants.warsawCalendar.isDate(start, equalTo: end, toGranularity: .month)
        guard sameMonth else {
            return "\(AppConstants.dayMonthFormatter.string(from: start)) - \(endText)"
        }
        return "\(dayOnly(start))-\(endText)"
    }

    /// Polish plural for a night count: 1 noc, 2-4 noce, 5+ nocy, with the
    /// 12-14 teens taking "nocy" regardless of the last digit.
    static func nightsWord(_ count: Int) -> String {
        let lastTwo = count % 100
        if lastTwo >= 12 && lastTwo <= 14 { return "nocy" }
        switch count % 10 {
        case 1: return "noc"
        case 2, 3, 4: return "noce"
        default: return "nocy"
        }
    }

    private static func day(_ iso: String) -> Date? {
        AppConstants.isoDayFormatter.date(from: iso)
    }

    private static func dayOnly(_ date: Date) -> String {
        AppConstants.dayOnlyFormatter.string(from: date)
    }
}
