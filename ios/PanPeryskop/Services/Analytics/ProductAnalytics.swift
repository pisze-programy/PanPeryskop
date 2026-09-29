import FirebaseAnalytics
import FirebaseCore
import Foundation

@MainActor
enum ProductAnalytics {
    private static var started = false

    static func start() {
        guard !started else { return }
        started = true
        FirebaseApp.configure()
    }

    static func trackingAnswered() {
        event("tracking_consent", ["status": TrackingConsent.isAuthorized ? "authorized" : "denied"])
    }

    static func registered() {
        event("sign_up")
    }

    static func contentOpened(kind: ContentKind, id: String) {
        event("content_open", ["content_kind": kind.rawValue, "content_id": id])
    }

    static func bookingTapped(kind: ContentKind, id: String) {
        event("booking_tap", ["content_kind": kind.rawValue, "content_id": id])
    }

    static func outbound(url: URL) {
        guard let partner = MetaTaxonomy.partner(for: url) else { return }
        bookingTapped(kind: partner.kind, id: partner.id)
    }

    static func screen(_ name: String) {
        event(AnalyticsEventScreenView, [
            AnalyticsParameterScreenName: name,
            AnalyticsParameterScreenClass: name
        ])
    }

    static func pinTapped(kind: String, id: String) {
        event("pin_tap", ["pin_kind": kind, "content_id": id])
    }

    static func placesOpened(kind: String, day: String) {
        event("place_open", ["place_kind": kind, "day": day])
    }

    private static func event(_ name: String, _ parameters: [String: Any] = [:]) {
        Analytics.logEvent(name, parameters: parameters)
    }
}
