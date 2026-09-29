import Foundation

@MainActor
enum MetaSignals {
    static func beganAfterConsent() async {
        await TrackingConsent.request()
        MetaEvents.startAfterConsent()
    }

    static func registered() {
        MetaEvents.sendRegistration()
    }

    static func content(kind: ContentKind, id: String, name: String) {
        MetaEvents.sendContent(kind: kind, id: id, name: name)
    }

    static func checkout(kind: ContentKind, id: String, name: String) {
        let eventId = UUID().uuidString
        MetaEvents.sendCheckout(kind: kind, id: id, name: name, eventId: eventId)
        MetaCheckoutReport.send(
            eventId: eventId,
            kind: kind,
            id: id,
            label: name,
            trackingEnabled: TrackingConsent.isAuthorized
        )
    }

    static func outbound(url: URL) {
        guard let partner = MetaTaxonomy.partner(for: url) else { return }
        checkout(kind: partner.kind, id: partner.id, name: partner.name)
    }
}
