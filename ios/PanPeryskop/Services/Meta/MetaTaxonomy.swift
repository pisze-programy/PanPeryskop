import FBSDKCoreKit

enum MetaContentKind: String {
    case city
    case event
    case place
    case story
    case flight
    case bus
    case stay
    case banner
    case car
    case partner
}

enum MetaTaxonomy {
    static let registration = AppEvents.Name("CompleteRegistration")
    static let contentView = AppEvents.Name("ViewContent")
    static let checkout = AppEvents.Name("InitiateCheckout")

    static func parameters(kind: MetaContentKind, id: String, name: String, eventId: String?) -> [AppEvents.ParameterName: Any] {
        var out: [AppEvents.ParameterName: Any] = [
            AppEvents.ParameterName("content_type"): kind.rawValue,
            AppEvents.ParameterName("content_ids"): [id],
            AppEvents.ParameterName("content_name"): name,
            AppEvents.ParameterName("content_category"): category(for: kind)
        ]
        if let eventId { out[AppEvents.ParameterName("event_id")] = eventId }
        return out
    }

    static func category(for kind: MetaContentKind) -> String {
        referralKinds.contains(kind) ? "referral" : "booking"
    }

    struct Partner {
        let kind: MetaContentKind
        let id: String
        let name: String
    }

    static func partner(for url: URL) -> Partner? {
        guard let host = url.host?.lowercased(), !isDenied(host) else { return nil }
        return Partner(kind: kind(for: host) ?? .partner, id: host, name: host)
    }

    static func kind(for host: String) -> MetaContentKind? {
        partnerHosts.first { host == $0.suffix || host.hasSuffix("." + $0.suffix) }?.kind
    }

    private static func isDenied(_ host: String) -> Bool {
        deniedHosts.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    private static let referralKinds: Set<MetaContentKind> = [.banner, .partner]

    private static let deniedHosts = [
        // Our own pages and the shortlink namespace. A banner logs at its own tap.
        "panperyskop.app",
        // Map and search links are not commerce.
        "google.com",
        "maps.apple.com",
        // A live-score page, not a partner.
        "espn.com"
    ]

    private static let partnerHosts: [(suffix: String, kind: MetaContentKind)] = [
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
