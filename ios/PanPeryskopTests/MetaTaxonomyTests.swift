import XCTest
import FBSDKCoreKit
@testable import PanPeryskop

final class MetaTaxonomyTests: XCTestCase {
    private let kinds: [ContentKind] = [
        .city, .event, .place, .story, .flight, .bus, .stay, .banner, .car, .partner
    ]

    func testEveryParameterValueIsAStringOrANumber() {
        for kind in kinds {
            let parameters = MetaTaxonomy.parameters(kind: kind, id: "id-1", name: "Name", eventId: "event-1")
            XCTAssertFalse(parameters.isEmpty, "\(kind.rawValue) carries no parameters")
            for value in parameters.values {
                XCTAssertTrue(
                    value is String || value is NSNumber,
                    "\(kind.rawValue) carries \(type(of: value)) as a value. The SDK drops the whole event for that."
                )
            }
        }
    }

    func testEveryParameterKeyIsAVisibleIdentifier() {
        let parameters = MetaTaxonomy.parameters(kind: .city, id: "id-1", name: "Name", eventId: "event-1")
        for key in parameters.keys {
            XCTAssertNotNil(
                key.rawValue.range(of: "^[A-Za-z0-9_]+$", options: .regularExpression),
                "\(key.rawValue) is not a visible identifier. The SDK drops the whole event for that."
            )
        }
    }

    func testCheckoutCarriesTheEventIdAndContentDoesNot() {
        let checkout = MetaTaxonomy.parameters(kind: .flight, id: "WAW-CRL", name: "Ryanair", eventId: "event-1")
        XCTAssertEqual(checkout[AppEvents.ParameterName("event_id")] as? String, "event-1")

        let content = MetaTaxonomy.parameters(kind: .city, id: "warszawa", name: "Warszawa", eventId: nil)
        XCTAssertNil(content[AppEvents.ParameterName("event_id")])
        XCTAssertEqual(content[AppEvents.ParameterName("content_ids")] as? String, "warszawa")
    }

    func testCategorySplitsBookingFromReferral() {
        XCTAssertEqual(MetaTaxonomy.category(for: .flight), "booking")
        XCTAssertEqual(MetaTaxonomy.category(for: .banner), "referral")
        XCTAssertEqual(MetaTaxonomy.category(for: .partner), "referral")
    }

    func testReferralTapsGetTheirOwnEventName() {
        XCTAssertEqual(MetaTaxonomy.eventName(for: .flight), MetaTaxonomy.checkout)
        XCTAssertEqual(MetaTaxonomy.eventName(for: .stay), MetaTaxonomy.checkout)
        XCTAssertEqual(MetaTaxonomy.eventName(for: .banner), MetaTaxonomy.referral)
        XCTAssertEqual(MetaTaxonomy.eventName(for: .partner), MetaTaxonomy.referral)
    }
}
