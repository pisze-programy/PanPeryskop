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
    private var running: [String: Task<FlightWindowResponse?, Never>] = [:]
    private var gateOpenAt = Date.distantPast

    private func paced<T>(_ work: @escaping () async -> T) async -> T {
        let now = Date()
        let wait = gateOpenAt.timeIntervalSince(now)
        if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
        gateOpenAt = Date().addingTimeInterval(Self.minimumSpacing)
        return await work()
    }

    private func shared(
        key: String,
        fetch: @escaping () async -> FlightWindowResponse?
    ) async -> FlightWindowResponse? {
        if let task = running[key] { return await task.value }
        let task = Task<FlightWindowResponse?, Never> { [weak self] in
            guard let self else { return nil }
            return await self.paced { await fetch() }
        }
        running[key] = task
        let window = await task.value
        running[key] = nil
        if let window { cache[key] = Entry(fetchedAt: Date(), window: window) }
        return window
    }

    /// The providers are external and a burst can get the app blocked, so the
    /// calls leave one at a time with a gap between them.
    private static let minimumSpacing: TimeInterval = 0.6
    private static let ttl: TimeInterval = 30 * 60

    func flights(airline: Airline, origin: String, destination: String, eventDay: Date) async -> FlightWindowResponse? {
        let day = Self.dayKey(eventDay)
        let key = "\(airline.rawValue)|\(origin)|\(destination)|\(day)"
        if let hit = cache[key], Date().timeIntervalSince(hit.fetchedAt) < Self.ttl {
            return hit.window
        }
        return await shared(key: key) {
            try? await APIClient.getFlights(
                airline: airline, origin: origin, destination: destination, eventDay: day
            )
        }
    }

    /// A whole month, both directions, for the city-break calendar.
    func month(airline: Airline, origin: String, destination: String, month: Date) async -> FlightWindowResponse? {
        let key = "month|\(airline.rawValue)|\(origin)|\(destination)|\(Self.monthKey(month))"
        if let hit = cache[key], Date().timeIntervalSince(hit.fetchedAt) < Self.ttl {
            return hit.window
        }
        return await shared(key: key) {
            try? await APIClient.getFlightMonth(
                airline: airline, origin: origin, destination: destination, month: Self.monthKey(month)
            )
        }
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