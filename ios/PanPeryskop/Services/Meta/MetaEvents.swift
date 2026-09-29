import FBSDKCoreKit

@MainActor
enum MetaEvents {
    private static let registrationKey = "meta_registration_sent"
    private static var activated = false

    static func startAfterConsent() {
        Settings.shared.isAutoLogAppEventsEnabled = true
        guard !activated else { return }
        activated = true
        AppEvents.shared.activateApp()
    }

    static func sendRegistration() {
        guard !UserDefaults.standard.bool(forKey: registrationKey) else { return }
        AppEvents.shared.logEvent(MetaTaxonomy.registration)
        UserDefaults.standard.set(true, forKey: registrationKey)
    }

    static func sendContent(kind: ContentKind, id: String, name: String) {
        AppEvents.shared.logEvent(
            MetaTaxonomy.contentView,
            parameters: MetaTaxonomy.parameters(kind: kind, id: id, name: name, eventId: nil)
        )
    }

    static func sendCheckout(kind: ContentKind, id: String, name: String, eventId: String?) {
        AppEvents.shared.logEvent(
            MetaTaxonomy.eventName(for: kind),
            parameters: MetaTaxonomy.parameters(kind: kind, id: id, name: name, eventId: eventId)
        )
    }
}
