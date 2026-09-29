import FBSDKCoreKit

enum MetaTaxonomy {
    static let registration = AppEvents.Name("CompleteRegistration")
    static let contentView = AppEvents.Name("ViewContent")
    static let checkout = AppEvents.Name("InitiateCheckout")
    static let referral = AppEvents.Name("PartnerReferral")

    static func eventName(for kind: ContentKind) -> AppEvents.Name {
        referralKinds.contains(kind) ? referral : checkout
    }

    static func parameters(kind: ContentKind, id: String, name: String, eventId: String?) -> [AppEvents.ParameterName: Any] {
        // The SDK drops any parameter that is not a string or a number. An array kills the event.
        var out: [AppEvents.ParameterName: Any] = [
            AppEvents.ParameterName("content_type"): kind.rawValue,
            AppEvents.ParameterName("content_ids"): id,
            AppEvents.ParameterName("content_name"): name,
            AppEvents.ParameterName("content_category"): category(for: kind)
        ]
        if let eventId { out[AppEvents.ParameterName("event_id")] = eventId }
        return out
    }

    static func category(for kind: ContentKind) -> String {
        referralKinds.contains(kind) ? "referral" : "booking"
    }

    struct Partner {
        let kind: ContentKind
        let id: String
        let name: String
    }

    static func partner(for url: URL) -> Partner? {
        guard let host = url.host?.lowercased(), !isDenied(host) else { return nil }
        return Partner(kind: kind(for: host) ?? .partner, id: host, name: host)
    }

    static func kind(for host: String) -> ContentKind? {
        partnerHosts.first { host == $0.suffix || host.hasSuffix("." + $0.suffix) }?.kind
    }

    private static func isDenied(_ host: String) -> Bool {
        deniedHosts.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    private static let referralKinds: Set<ContentKind> = [.banner, .partner]

    private static let deniedHosts = [
        // Our own pages and the shortlink namespace. A banner logs at its own tap.
        "panperyskop.app",
        // Map and search links are not commerce.
        "google.com",
        "maps.apple.com",
        // A live-score page, not a partner.
        "espn.com"
    ]

    private static let partnerHosts: [(suffix: String, kind: ContentKind)] = [
        ("ryanair.com", .flight),
        ("wizzair.com", .flight),
        ("kupbilecik.pl", .flight),
        ("flixbus.com", .bus),
        ("flixbus.pl", .bus),
        ("stay22.com", .stay),
        ("booking.com", .stay),
        ("airbnb.com", .stay),
        ("viator.com", .place),
        ("getyourguide.com", .place),
        ("eventim.pl", .event),
        ("ebilet.pl", .event),
        ("goingapp.pl", .event),
        ("maratonypolskie.pl", .event),
        ("ticketmaster.pl", .event),
        ("ra.co", .event),
        ("qeeq.pl", .car),
        ("qeeq.com", .car)
    ]
}
