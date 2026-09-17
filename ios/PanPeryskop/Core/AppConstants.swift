import Foundation
import SwiftUI

/// Shared app-wide constants — single source of truth for values mirrored from the
/// backend. Date/formatter/camera tokens live in `AppDates`/`AppFormatters`/`AppCamera`.
enum AppConstants {
    /// Hours per day — avoids raw magic numbers.
    static let hourMs: Int64 = 3_600_000
    static let secondsPerHour: TimeInterval = 3600

    /// Minimum time the category-pill loader stays visible after a (non-poll)
    /// day/place fetch — so a fast response never flashes the spinner.
    static let minLoadingIndicatorMs: Int = 250

    /// Post (event/live) visibility window — mirrors backend `TTL_HOURS` (24h).
    static let postTTLHours: TimeInterval = 24
    static let postTTLMs: Int64 = 24 * hourMs

    /// Showtime marker for an UNKNOWN start time — mirrors backend `UNKNOWN_TIME`
    /// ("00:00" = all-day events, never time-filtered).
    static let unknownTime = "00:00"

    /// Content categories — mirror backend `POST_CATEGORIES`.
    static let categoryLive = "live"
    static let categoryEvents = "events"

    /// Pending post staleness — uploads older than this are discarded.
    static let pendingStaleAfter: TimeInterval = 12 * 3600

    /// Flight availability cache TTL (seconds) — mirrors backend 30-min cache.
    static let flightCacheTTL: TimeInterval = 30 * 60

    /// Wycieczki API limit — mirrors backend MAX_LIMIT.
    static let apiLimit = 1000

    /// Match title separator (backend espn.ts joins teams with this).
    static let matchSeparator = " vs "

    /// Travel tag for running races (backend worldsmarathons.ts).
    static let runTag = "biegi"

    /// Hotel money the flight picker trades against the fare. A night the trip
    /// forces costs this much, so a cheaper fare further from the event loses.
    static let hotelNightlyEstimate: Double = 350
    static let hotelSaturdayNightlyEstimate: Double = 500
    static let saturdayWeekday = 7
    static let secondsPerDay: TimeInterval = 24 * secondsPerHour

    /// The trip-events request may take a slow first pass on a new origin; a
    /// longer wait than this shows nothing useful, so the loader stops instead.
    static let travelRequestTimeout: TimeInterval = 10
    static let travelErrorToastSeconds: Double = 1

    /// Springs — the app's three animation configs (was inline magic).
    static let springStandard = Animation.spring(response: 0.35, dampingFraction: 0.82)
    static let springSoft = Animation.spring(response: 0.35, dampingFraction: 0.8)
    static let springSnappy = Animation.spring(response: 0.3, dampingFraction: 0.85)
}