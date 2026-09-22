import Foundation

struct FlightRange: Equatable {
    private(set) var outbound: Date?
    private(set) var returning: Date?

    var isComplete: Bool {
        guard let outbound, let returning else { return false }
        return returning > outbound
    }

    var nights: Int? {
        guard isComplete, let outbound, let returning else { return nil }
        return Self.nights(from: outbound, to: returning)
    }

    static func nights(from start: Date, to end: Date) -> Int? {
        let calendar = AppConstants.warsawCalendar
        return calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: start),
            to: calendar.startOfDay(for: end)
        ).day
    }

    mutating func select(_ day: Date, maxNights: Int = AppConstants.cityBreakMaxNights) {
        let calendar = AppConstants.warsawCalendar
        let target = calendar.startOfDay(for: day)
        guard let start = outbound, returning == nil else {
            outbound = target
            returning = nil
            return
        }
        guard Self.isInside(target, after: start, maxNights: maxNights) else {
            outbound = target
            returning = nil
            return
        }
        returning = target
    }

    static func isInside(_ day: Date, after start: Date, maxNights: Int) -> Bool {
        guard let nights = nights(from: start, to: day) else { return false }
        return nights >= 1 && nights <= maxNights
    }

    func latestReturn(maxNights: Int = AppConstants.cityBreakMaxNights) -> Date? {
        guard let outbound else { return nil }
        return AppConstants.warsawCalendar.date(byAdding: .day, value: maxNights, to: outbound)
    }
}
