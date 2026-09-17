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
    let nights: Int
    let hotelCost: Double
    let generalizedCost: Double
}

/// Picks the pair with the lowest generalized cost: the two fares plus the hotel
/// nights the trip forces. A cheap fare a week before the event loses to a dearer
/// one the day before, because the extra nights cost more than the fare saves.
enum FlightScoring {
    static func findBestFlight(outbound: [FlightCell], returning: [FlightCell], eventDate: Date) -> FlightPair? {
        allPairs(outbound: outbound, returning: returning, eventDate: eventDate).min(by: isBetter)
    }

    private static func isBetter(_ lhs: FlightPair, _ rhs: FlightPair) -> Bool {
        if lhs.generalizedCost != rhs.generalizedCost { return lhs.generalizedCost < rhs.generalizedCost }
        if lhs.nights != rhs.nights { return lhs.nights < rhs.nights }
        if lhs.total != rhs.total { return lhs.total < rhs.total }
        return lhs.outbound.date > rhs.outbound.date
    }

    private static func allPairs(outbound: [FlightCell], returning: [FlightCell], eventDate: Date) -> [FlightPair] {
        outbound.flatMap { start in
            returning.compactMap { end in pair(start, end, eventDate: eventDate) }
        }
    }

    private static func pair(_ start: FlightCell, _ end: FlightCell, eventDate: Date) -> FlightPair? {
        guard let startPrice = start.price, let endPrice = end.price else { return nil }
        guard start.date < eventDate, end.date > eventDate else { return nil }
        let nights = max(0, AppConstants.warsawCalendar.daysBetween(start.date, end.date))
        let hotel = hotelCost(from: start.date, nights: nights)
        return FlightPair(
            outbound: start,
            returning: end,
            total: startPrice + endPrice,
            nights: nights,
            hotelCost: hotel,
            generalizedCost: startPrice + endPrice + hotel
        )
    }

    private static func hotelCost(from start: Date, nights: Int) -> Double {
        let calendar = AppConstants.warsawCalendar
        return (0..<nights).reduce(0) { total, offset in
            let night = calendar.date(byAdding: .day, value: offset, to: start) ?? start
            let isSaturday = calendar.component(.weekday, from: night) == AppConstants.saturdayWeekday
            return total + (isSaturday ? AppConstants.hotelSaturdayNightlyEstimate : AppConstants.hotelNightlyEstimate)
        }
    }
}

extension Calendar {
    func daysBetween(_ a: Date, _ b: Date) -> Int {
        let startOfA = startOfDay(for: a)
        let startOfB = startOfDay(for: b)
        return Int(round(startOfB.timeIntervalSince(startOfA) / AppConstants.secondsPerDay))
    }
}