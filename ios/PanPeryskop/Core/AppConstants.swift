import Foundation
import SwiftUI

/// Shared app-wide constants — single source of truth for values mirrored from the
/// backend. Date/formatter/camera tokens live in `AppDates`/`AppFormatters`/`AppCamera`.
enum AppConstants {
    /// Hours per day — avoids raw magic numbers.
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