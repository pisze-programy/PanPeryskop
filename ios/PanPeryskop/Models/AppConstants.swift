import Foundation
import CoreLocation
import SwiftUI

/// Shared app-wide constants — single source of truth for values mirrored from the
/// backend (mirrors backend/src/core/models.ts + seed/core/constants.ts).
enum AppConstants {
    /// Hours per day — avoids raw magic numbers below.
    static let hourMs: Int64 = 3_600_000
    static let secondsPerHour: TimeInterval = 3600

    /// Post (event/live) visibility window — mirrors backend `TTL_HOURS` (24h).
    static let postTTLHours: TimeInterval = 24
    static let postTTLMs: Int64 = 24 * hourMs

    /// Media request pin lifetime — mirrors backend `MEDIA_REQUEST_TTL_MS` (4h).
    static let mediaRequestTTLHours: TimeInterval = 4
    static let mediaRequestTTLMs: Int64 = 4 * hourMs

    /// Showtime marker for an UNKNOWN start time — mirrors backend `UNKNOWN_TIME`
    /// ("00:00" = all-day events, never time-filtered).
    static let unknownTime = "00:00"

    /// Content categories — mirror backend `POST_CATEGORIES`.
    static let categoryLive = "live"
    static let categoryEvents = "events"

    /// Pending post staleness — uploads older than this are discarded.
    static let pendingStaleAfter: TimeInterval = 12 * 3600

    // MARK: - Wycieczki (travel)

    /// App wall-clock zone — single source for every date/time in the trips feature.
    static let warsawTimeZone: TimeZone = TimeZone(identifier: "Europe/Warsaw")!

    /// Gregorian calendar in the Warsaw zone.
    static let warsawCalendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = warsawTimeZone
        return c
    }()

    /// Cached date formatters (DateFormatter creation is expensive — reuse).
    static let isoDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = warsawCalendar
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    static let shortDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = warsawCalendar
        f.locale = Locale(identifier: "pl_PL")
        f.dateFormat = "dd.MM"
        return f
    }()
    static let weekdayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = warsawCalendar
        f.locale = Locale(identifier: "pl_PL")
        f.dateFormat = "EEE"
        return f
    }()
    static let fullDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = warsawCalendar
        f.locale = Locale(identifier: "pl_PL")
        f.dateFormat = "d MMM yyyy"
        return f
    }()
    static let hourFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = warsawCalendar
        f.dateFormat = "HH:mm"
        return f
    }()

    /// Nearby-airport radius + camera distances (mirror backend / map providers).
    static let nearbyAirportRadiusMeters: CLLocationDistance = 200_000
    static let eventsMaxZoomOutDistance: CLLocationDistance = 100_000
    static let tripsMaxZoomOutDistance: CLLocationDistance = 6_000_000
    static let requestPinMinDistance: Double = 0.0008

    /// Flight availability cache TTL (seconds) — mirrors backend 30-min cache.
    static let flightCacheTTL: TimeInterval = 30 * 60

    /// Wycieczki API limit — mirrors backend MAX_LIMIT.
    static let apiLimit = 1000

    /// Match title separator (backend espn.ts joins teams with this).
    static let matchSeparator = " vs "

    /// Springs — the app's three animation configs (was inline magic).
    static let springStandard = Animation.spring(response: 0.35, dampingFraction: 0.82)
    static let springSoft = Animation.spring(response: 0.35, dampingFraction: 0.8)
    static let springSnappy = Animation.spring(response: 0.3, dampingFraction: 0.85)
}