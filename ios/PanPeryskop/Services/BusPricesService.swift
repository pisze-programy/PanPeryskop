import Foundation

/// Bus offers for a (origin city, event city) pair on the event day.
/// Fetched on section open, cached in-memory with a 30-min TTL.
@MainActor
final class BusPricesService {
    static let shared = BusPricesService()

    private struct Entry {
        let fetchedAt: Date
        let window: BusWindowResponse
    }
    private var cache: [String: Entry] = [:]

    func bus(fromCity: String, toCity: String, eventDay: Date) async throws -> BusWindowResponse {
        let day = Self.dayKey(eventDay)
        let key = "\(fromCity.lowercased())|\(toCity.lowercased())|\(day)"
        if let hit = cache[key], Date().timeIntervalSince(hit.fetchedAt) < 30 * 60 {
            return hit.window
        }
        let window = try await APIClient.getBusWindow(fromCity: fromCity, toCity: toCity, eventDay: day)
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
