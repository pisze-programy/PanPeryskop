import Foundation

/// One flight-day cell in the grid.
struct FlightCell: Equatable {
    let date: Date
    let hour: String?
    let price: Double?
}

/// A chosen outbound+return pair spanning an event.
struct FlightPair: Equatable {
    let outbound: FlightCell
    let returning: FlightCell
    let total: Double
    let durationDays: Int
    let distanceToEventDays: Int
}

/// Port of run-travel-club's `findBestFlight`: among all out×return pairs that
/// strictly span the event date (out < event < ret), keep only pairs within
/// 1.2× the minimum total, then pick the shortest trip, then the closest to the
/// event, then the cheapest. "Spanning the event" = avoid extra hotel nights.
enum FlightScoring {
    private static let bestPairBudgetMultiplier = 1.2
    static let secondsPerDay: Double = 24 * AppConstants.secondsPerHour

    static func findBestFlight(outbound: [FlightCell], returning: [FlightCell], eventDate: Date) -> FlightPair? {
        let calendar = AppConstants.warsawCalendar
        var pairs: [FlightPair] = []
        for o in outbound {
            guard let outPrice = o.price else { continue }
            guard o.date < eventDate else { continue }
            for r in returning {
                guard let retPrice = r.price else { continue }
                guard r.date > eventDate else { continue }
                pairs.append(FlightPair(
                    outbound: o,
                    returning: r,
                    total: outPrice + retPrice,
                    durationDays: calendar.daysBetween(o.date, r.date),
                    distanceToEventDays: abs(calendar.daysBetween(o.date, eventDate)) + abs(calendar.daysBetween(eventDate, r.date))
                ))
            }
        }
        guard !pairs.isEmpty, let minTotal = pairs.map(\.total).min() else { return nil }
        let withinBudget = pairs.filter { $0.total <= minTotal * Self.bestPairBudgetMultiplier }
        return withinBudget
            .sorted { lhs, rhs in
                if lhs.durationDays != rhs.durationDays { return lhs.durationDays < rhs.durationDays }
                if lhs.distanceToEventDays != rhs.distanceToEventDays { return lhs.distanceToEventDays < rhs.distanceToEventDays }
                return lhs.total < rhs.total
            }
            .first
    }
}

private extension Calendar {
    func daysBetween(_ a: Date, _ b: Date) -> Int {
        let startOfA = startOfDay(for: a)
        let startOfB = startOfDay(for: b)
        return Int(round(startOfB.timeIntervalSince(startOfA) / FlightScoring.secondsPerDay))
    }
}