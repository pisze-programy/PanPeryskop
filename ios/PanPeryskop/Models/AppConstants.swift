import Foundation

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
}