import FBSDKCoreKit

enum MetaEvents {
    private static let registrationKey = "meta_registration_sent"

    static func startAfterConsent() {
        Settings.shared.isAutoLogAppEventsEnabled = true
        AppEvents.shared.activateApp()
    }

    static func sendRegistration() {
        guard !UserDefaults.standard.bool(forKey: registrationKey) else { return }
        UserDefaults.standard.set(true, forKey: registrationKey)
        AppEvents.shared.logEvent(MetaTaxonomy.registration)
    }

    static func sendContent(kind: MetaContentKind, id: String, name: String) {
        AppEvents.shared.logEvent(
            MetaTaxonomy.contentView,
            parameters: MetaTaxonomy.parameters(kind: kind, id: id, name: name, eventId: nil)
        )
    }

    static func sendCheckout(kind: MetaContentKind, id: String, name: String, eventId: String?) {
        AppEvents.shared.logEvent(
            MetaTaxonomy.checkout,
            parameters: MetaTaxonomy.parameters(kind: kind, id: id, name: name, eventId: eventId)
        )
    }
}
