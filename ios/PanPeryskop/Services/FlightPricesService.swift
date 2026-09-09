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
        let key = "\(origin)|\(destination)|\(day)"
        if let hit = cache[key], Date().timeIntervalSince(hit.fetchedAt) < 30 * 60 {
            return hit.window
        }
        guard let window = try? await APIClient.getFlights(
            airline: airline, origin: origin, destination: destination, eventDay: day
        ) else { return nil }
        cache[key] = Entry(fetchedAt: Date(), window: window)
        return window
    }

    private static func dayKey(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "Europe/Warsaw")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}