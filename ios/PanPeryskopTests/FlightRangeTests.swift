import XCTest
@testable import PanPeryskop

final class FlightRangeTests: XCTestCase {
    private let fmt: DateFormatter = {
        let f = DateFormatter()
        f.calendar = AppConstants.warsawCalendar
        f.timeZone = AppConstants.warsawCalendar.timeZone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private func date(_ day: String) -> Date { fmt.date(from: day)! }

    func testEmptyRangeIsNotComplete() {
        let range = FlightRange()
        XCTAssertFalse(range.isComplete)
        XCTAssertNil(range.outbound)
        XCTAssertNil(range.returning)
        XCTAssertNil(range.nights)
    }

    func testFirstTapSetsOnlyTheOutbound() {
        var range = FlightRange()
        range.select(date("2026-03-10"))
        XCTAssertEqual(range.outbound, date("2026-03-10"))
        XCTAssertNil(range.returning)
        XCTAssertFalse(range.isComplete)
    }

    func testSecondTapInsideTheWindowClosesTheRange() {
        var range = FlightRange()
        range.select(date("2026-03-10"))
        range.select(date("2026-03-13"))
        XCTAssertTrue(range.isComplete)
        XCTAssertEqual(range.nights, 3)
    }

    func testOneNightIsAllowed() {
        var range = FlightRange()
        range.select(date("2026-03-10"))
        range.select(date("2026-03-11"))
        XCTAssertTrue(range.isComplete)
        XCTAssertEqual(range.nights, 1)
    }

    func testExactlyTheMaximumNightsIsAllowed() {
        var range = FlightRange()
        range.select(date("2026-03-10"))
        range.select(date("2026-03-17"))
        XCTAssertTrue(range.isComplete)
        XCTAssertEqual(range.nights, AppConstants.cityBreakMaxNights)
    }

    func testReturnBeforeTheOutboundRestartsTheRange() {
        var range = FlightRange()
        range.select(date("2026-03-10"))
        range.select(date("2026-03-08"))
        XCTAssertEqual(range.outbound, date("2026-03-08"))
        XCTAssertNil(range.returning)
    }

    func testReturnOnTheSameDayRestartsTheRange() {
        var range = FlightRange()
        range.select(date("2026-03-10"))
        range.select(date("2026-03-10"))
        XCTAssertEqual(range.outbound, date("2026-03-10"))
        XCTAssertNil(range.returning)
    }

    func testReturnPastTheMaximumRestartsTheRange() {
        var range = FlightRange()
        range.select(date("2026-03-10"))
        range.select(date("2026-03-18"))
        XCTAssertEqual(range.outbound, date("2026-03-18"))
        XCTAssertNil(range.returning)
    }

    func testTapOnACompleteRangeRestartsIt() {
        var range = FlightRange()
        range.select(date("2026-03-10"))
        range.select(date("2026-03-13"))
        range.select(date("2026-04-02"))
        XCTAssertEqual(range.outbound, date("2026-04-02"))
        XCTAssertNil(range.returning)
        XCTAssertFalse(range.isComplete)
    }

    func testRangeAcrossMonthsCountsTheNights() {
        var range = FlightRange()
        range.select(date("2026-03-30"))
        range.select(date("2026-04-02"))
        XCTAssertTrue(range.isComplete)
        XCTAssertEqual(range.nights, 3)
    }

    func testRangeAcrossTheClockChangeCountsWholeNights() {
        var range = FlightRange()
        range.select(date("2026-03-28"))
        range.select(date("2026-03-31"))
        XCTAssertTrue(range.isComplete)
        XCTAssertEqual(range.nights, 3)
    }

    func testLatestReturnIsTheOutboundPlusTheMaximum() {
        var range = FlightRange()
        range.select(date("2026-03-10"))
        XCTAssertEqual(range.latestReturn(), date("2026-03-17"))
    }

    func testLatestReturnAcrossTheClockChangeLandsRight() {
        var range = FlightRange()
        range.select(date("2026-03-28"))
        XCTAssertEqual(range.latestReturn(), date("2026-04-04"))
    }

    func testLatestReturnIsNilWithoutAnOutbound() {
        XCTAssertNil(FlightRange().latestReturn())
    }
}
