import Foundation

@MainActor
final class FlightPricesService {
    static let shared = FlightPricesService()

    private struct Entry {
        let fetchedAt: Date
        let window: FlightWindowResponse
    }

    private var cache: [String: Entry] = [:]
    private var running: [String: Task<FlightWindowResponse?, Never>] = [:]
    private var nextCallAt = Date.distantPast

    private static let minimumSpacing: TimeInterval = 0.6
    private static let minimumLoad: TimeInterval = 1.0
    private static let ttl: TimeInterval = 30 * 60

    func flights(airline: Airline, origin: String, destination: String, eventDay: Date) async -> FlightWindowResponse? {
        let day = Self.dayKey(eventDay)
        let key = "\(airline.rawValue)|\(origin)|\(destination)|\(day)"
        return await value(key: key) {
            try? await APIClient.getFlights(
                airline: airline, origin: origin, destination: destination, eventDay: day
            )
        }
    }

    func month(airline: Airline, origin: String, destination: String, month: Date) async -> FlightWindowResponse? {
        let key = "month|\(airline.rawValue)|\(origin)|\(destination)|\(Self.monthKey(month))"
        return await value(key: key) {
            try? await APIClient.getFlightMonth(
                airline: airline, origin: origin, destination: destination, month: Self.monthKey(month)
            )
        }
    }

    private func value(key: String, load: @escaping () async -> FlightWindowResponse?) async -> FlightWindowResponse? {
        if let hit = cache[key], Date().timeIntervalSince(hit.fetchedAt) < Self.ttl {
            return hit.window
        }
        if let task = running[key] { return await task.value }
        let task = Task { [weak self] in
            guard let self else { return nil as FlightWindowResponse? }
            await self.waitForTurn()
            return await self.paced(load)
        }
        running[key] = task
        let window = await task.value
        running[key] = nil
        if let window { cache[key] = Entry(fetchedAt: Date(), window: window) }
        return window
    }

    /// Hold the result for a minimum time. The month calendar draws a skeleton
    /// while it waits, and a fast answer would flash it for a few frames. The
    /// floor also keeps the request rate gentle.
    private func paced(_ load: @escaping () async -> FlightWindowResponse?) async -> FlightWindowResponse? {
        let started = Date()
        let answer = await load()
        let remaining = Self.minimumLoad - Date().timeIntervalSince(started)
        if remaining > 0 { try? await Task.sleep(for: .seconds(remaining)) }
        return answer
    }

    private func waitForTurn() async {
        let wait = nextCallAt.timeIntervalSinceNow
        if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
        nextCallAt = Date().addingTimeInterval(Self.minimumSpacing)
    }

    static func monthKey(_ date: Date) -> String {
        let calendar = AppConstants.warsawCalendar
        let components = calendar.dateComponents([.year, .month], from: date)
        return String(format: "%04d-%02d-01", components.year ?? 2000, components.month ?? 1)
    }

    private static func dayKey(_ date: Date) -> String {
        AppConstants.isoDayFormatter.string(from: date)
    }
}
