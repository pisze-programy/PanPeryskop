import SwiftUI
import MapKit

private final class ArcCurveCache: @unchecked Sendable {
    static let shared = ArcCurveCache()

    private struct Key: Hashable {
        let fromLat: Double
        let fromLng: Double
        let toLat: Double
        let toLng: Double
        let bowOffset: Double
    }

    private let lock = NSLock()
    private var entries: [Key: [CLLocationCoordinate2D]] = [:]
    private var order: [Key] = []
    private static let limit = 256

    func curve(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D, bowOffset: Double) -> [CLLocationCoordinate2D] {
        let key = Key(
            fromLat: from.latitude,
            fromLng: from.longitude,
            toLat: to.latitude,
            toLng: to.longitude,
            bowOffset: bowOffset
        )
        lock.lock()
        if let cached = entries[key] {
            lock.unlock()
            return cached
        }
        lock.unlock()

        let built = ArcBuilder.curve(from: from, to: to, bowOffset: bowOffset)
        insert(built, for: key)
        return built
    }

    private func insert(_ curve: [CLLocationCoordinate2D], for key: Key) {
        lock.lock()
        defer { lock.unlock() }
        guard entries[key] == nil else { return }
        entries[key] = curve
        order.append(key)
        evictIfNeeded()
    }

    private func evictIfNeeded() {
        guard order.count > Self.limit else { return }
        let evicted = order.removeFirst()
        entries.removeValue(forKey: evicted)
    }
}

extension FlightArc {
    var polyline: MKPolyline {
        var coords = ArcCurveCache.shared.curve(from: from, to: to, bowOffset: bowOffset)
        let count = progress < 1
            ? min(coords.count, max(2, Int(Double(coords.count) * progress)))
            : coords.count
        return MKPolyline(coordinates: &coords, count: count)
    }

    var color: Color {
        airlines.contains(.wizzair) ? Airline.wizzair.color : Airline.ryanair.color
    }

    var isDualCarrier: Bool {
        airlines.contains(.ryanair) && airlines.contains(.wizzair)
    }
}
