import XCTest
import CoreLocation
@testable import PanPeryskop

final class StaysWidgetQueryTests: XCTestCase {
    private let point = StaysAnchorPoint(lat: 52.4, lng: 16.9, address: nil)

    private func query(
        checkin: String = "2026-10-17",
        checkout: String = "2026-10-19",
        theme: String = "light"
    ) -> StaysWidgetQuery {
        StaysWidgetQuery(point: point, checkin: checkin, checkout: checkout, theme: theme, view: .mini)
    }

    func testKeyChangesWithEveryField() {
        let base = query()
        XCTAssertNotEqual(base.key, query(checkin: "2026-10-18").key)
        XCTAssertNotEqual(base.key, query(checkout: "2026-10-20").key)
        XCTAssertNotEqual(base.key, query(theme: "dark").key)
        XCTAssertNotEqual(base.key, StaysWidgetQuery(point: StaysAnchorPoint(lat: 52.5, lng: 16.9, address: nil), checkin: "2026-10-17", checkout: "2026-10-19", theme: "light", view: .mini).key)
    }

    func testKeyIsStableForTheSameInput() {
        XCTAssertEqual(query().key, query().key)
    }

    func testKeySeparatesMiniAndFull() {
        let full = StaysWidgetQuery(point: point, checkin: "2026-10-17", checkout: "2026-10-19", theme: "light", view: .full)
        XCTAssertNotEqual(query().key, full.key)
    }
}

final class StaysAnchorPointTests: XCTestCase {
    private let event = TravelEvent(
        provider: "test",
        external_id: "1",
        title: "A vs B",
        lat: 52.4,
        lng: 16.9,
        city: "Poznań",
        country: "Poland",
        start_ms: 0,
        tag: "soccer",
        link: nil,
        meta: nil,
        reachableAirports: nil
    )

    func testEventAnchorUsesEventCoordinates() {
        let point = StaysAnchorPoint.resolve(.event, event: event, airportCoordinate: nil)
        XCTAssertEqual(point.lat, 52.4)
        XCTAssertEqual(point.lng, 16.9)
        XCTAssertNil(point.address)
    }

    func testCentreAnchorUsesCityAddress() {
        let point = StaysAnchorPoint.resolve(.centre, event: event, airportCoordinate: nil)
        XCTAssertNil(point.lat)
        XCTAssertEqual(point.address, "Poznań, Poland")
    }

    func testAirportAnchorWithoutCoordinateFallsBackToEvent() {
        let point = StaysAnchorPoint.resolve(.airport, event: event, airportCoordinate: nil)
        XCTAssertEqual(point.lat, 52.4)
        XCTAssertEqual(point.lng, 16.9)
    }

    func testAirportAnchorUsesAirportCoordinate() {
        let airport = CLLocationCoordinate2D(latitude: 52.42, longitude: 16.83)
        let point = StaysAnchorPoint.resolve(.airport, event: event, airportCoordinate: airport)
        XCTAssertEqual(point.lat, 52.42)
        XCTAssertEqual(point.lng, 16.83)
    }
}

final class StaysDefaultDatesTests: XCTestCase {
    private func event(day: String) -> TravelEvent {
        TravelEvent(
            provider: "test",
            external_id: "1",
            title: "A vs B",
            lat: 52.4,
            lng: 16.9,
            city: "Poznań",
            country: "Poland",
            start_ms: 0,
            tag: "soccer",
            link: nil,
            meta: "{\"date\":\"\(day)\"}",
            reachableAirports: nil
        )
    }

    func testNightBeforeCheckinIsOneDayEarlier() {
        XCTAssertEqual(event(day: "2026-10-17").nightBeforeCheckin, "2026-10-16")
    }

    func testNightBeforeCheckinCrossesMonthStart() {
        XCTAssertEqual(event(day: "2026-11-01").nightBeforeCheckin, "2026-10-31")
    }

    func testIsoDayMatchesTheEventDay() {
        XCTAssertEqual(event(day: "2026-10-17").isoDay, "2026-10-17")
    }
}

final class StaysSortOptionsTests: XCTestCase {
    func testStarOptionsCarryTheUnit() {
        XCTAssertEqual(StaysSort.starOptions.map { $0.1 }, ["Dowolny", "3 gwiazdki i więcej", "4 gwiazdki i więcej", "5 gwiazdek"])
        XCTAssertEqual(StaysSort.starOptions.map { $0.0 }, [nil, 3, 4, 5])
    }

    func testGuestOptionsCarryTheScale() {
        XCTAssertEqual(StaysSort.guestOptions.map { $0.1 }, ["Dowolna", "8+/10", "9+/10"])
        XCTAssertEqual(StaysSort.guestOptions.map { $0.0 }, [nil, 8, 9])
    }

    func testPriceOptions() {
        XCTAssertEqual(StaysSort.priceOptions.map { $0.1 }, ["Za noc", "Za całość"])
    }

    func testNightlyPriceIsTheDefault() {
        XCTAssertEqual(StaysSort().priceper, StaysSort.nightly)
        XCTAssertFalse(StaysSort().isActive)
    }

    func testIsActiveFollowsAnyChangeFromTheDefault() {
        XCTAssertTrue(StaysSort(priceper: StaysSort.total).isActive)
        XCTAssertTrue(StaysSort(minstars: 3).isActive)
        XCTAssertTrue(StaysSort(minguest: 8).isActive)
    }
}

final class StayRangeTests: XCTestCase {
    func testNightsCountFromCheckinToCheckout() {
        XCTAssertEqual(StayRange.nights(from: "2026-11-11", to: "2026-11-14"), 3)
        XCTAssertEqual(StayRange.nights(from: "2026-11-11", to: "2026-11-12"), 1)
    }

    func testLabelWithinOneMonth() {
        XCTAssertEqual(StayRange.label(from: "2026-11-11", to: "2026-11-14"), "3 noce, 11-14 listopada")
    }

    func testLabelAcrossMonths() {
        XCTAssertEqual(StayRange.label(from: "2026-10-30", to: "2026-11-02"), "3 noce, 30 października - 2 listopada")
    }

    func testLabelForOneNight() {
        XCTAssertEqual(StayRange.label(from: "2026-11-11", to: "2026-11-12"), "1 noc, 11-12 listopada")
    }

    func testNightsWordPlurals() {
        XCTAssertEqual(StayRange.label(from: "2026-11-11", to: "2026-11-13"), "2 noce, 11-13 listopada")
        XCTAssertEqual(StayRange.label(from: "2026-11-11", to: "2026-11-16"), "5 nocy, 11-16 listopada")
        XCTAssertEqual(StayRange.label(from: "2026-11-11", to: "2026-11-23"), "12 nocy, 11-23 listopada")
        XCTAssertEqual(StayRange.label(from: "2026-11-11", to: "2026-11-25"), "14 nocy, 11-25 listopada")
        XCTAssertEqual(StayRange.label(from: "2026-11-11", to: "2026-11-24"), "13 nocy, 11-24 listopada")
        XCTAssertEqual(StayRange.label(from: "2026-11-11", to: "2026-11-26"), "15 nocy, 11-26 listopada")
    }

    func testTotalPriceLabelCarriesTheRange() {
        XCTAssertEqual(StayRange.totalPriceLabel(from: "2026-11-11", to: "2026-11-14"), "Za całość (3 noce, 11-14 listopada)")
    }
}
