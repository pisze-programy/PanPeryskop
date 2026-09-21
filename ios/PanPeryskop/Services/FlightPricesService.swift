import Foundation

/// Flight availability for a (origin, destination) pair around an event day.
/// Fetched on card open (2–6 requests), cached in-memory with a 30-min TTL.
@MainActor
final class FlightPricesService {
    static let shared = FlightPricesService()

    private struct Entry {
        let fetchedAt: Date
        let window: FlightWindowResponse
    }
    private var cache: [String: Entry] = [:]

    func flights(airline: Airline, origin: String, destination: String, eventDay: Date) async -> FlightWindowResponse? {
        let day = Self.dayKey(eventDay)
        let key = "\(airline.rawValue)|\(origin)|\(destination)|\(day)"
        if let hit = cache[key], Date().timeIntervalSince(hit.fetchedAt) < 30 * 60 {
            return hit.window
        }
        guard let window = try? await APIClient.getFlights(
            airline: airline, origin: origin, destination: destination, eventDay: day
        ) else { return nil }
        cache[key] = Entry(fetchedAt: Date(), window: window)
        return window
    }

    /// A whole month, both directions, for the city-break calendar.
    func month(airline: Airline, origin: String, destination: String, month: Date) async -> FlightWindowResponse? {
        let key = "month|\(airline.rawValue)|\(origin)|\(destination)|\(Self.monthKey(month))"
        if let hit = cache[key], Date().timeIntervalSince(hit.fetchedAt) < 30 * 60 {
            return hit.window
        }
        guard let window = try? await APIClient.getFlightMonth(
            airline: airline, origin: origin, destination: destination, month: Self.monthKey(month)
        ) else { return nil }
        cache[key] = Entry(fetchedAt: Date(), window: window)
        return window
    }

    /// First day of the month, YYYY-MM-01.
    static func monthKey(_ date: Date) -> String {
        let calendar = AppConstants.warsawCalendar
        let components = calendar.dateComponents([.year, .month], from: date)
        return String(format: "%04d-%02d-01", components.year ?? 2000, components.month ?? 1)
    }

    private static func dayKey(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "Europe/Warsaw")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}