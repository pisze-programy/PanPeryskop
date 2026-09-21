import Foundation

struct FlightCell: Equatable {
    let date: Date
    let hour: String?
    let price: Double?
}

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

    /// City break: there is no event day. The anchor is the day picked on the map,
    /// so the trip may start a few days around it and last 1–7 nights.
    static func findBestCityTrip(outbound: [FlightCell], returning: [FlightCell], anchor: Date) -> FlightPair? {
        let calendar = AppConstants.warsawCalendar
        let from = calendar.date(byAdding: .day, value: -3, to: anchor) ?? anchor
        let to = calendar.date(byAdding: .day, value: 3, to: anchor) ?? anchor
        return outbound
            .filter { $0.price != nil && $0.date >= from && $0.date <= to }
            .flatMap { start in returning.compactMap { cityPair(start, $0) } }
            .min(by: isBetter)
    }

    private static func cityPair(_ start: FlightCell, _ end: FlightCell) -> FlightPair? {
        guard let startPrice = start.price, let endPrice = end.price else { return nil }
        let nights = AppConstants.warsawCalendar.daysBetween(start.date, end.date)
        guard nights >= 1, nights <= AppConstants.cityBreakMaxNights else { return nil }
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
}

extension Calendar {
    func daysBetween(_ a: Date, _ b: Date) -> Int {
        let startOfA = startOfDay(for: a)
        let startOfB = startOfDay(for: b)
        return Int(round(startOfB.timeIntervalSince(startOfA) / AppConstants.secondsPerDay))
    }
}