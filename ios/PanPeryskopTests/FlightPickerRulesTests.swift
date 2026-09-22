import XCTest
@testable import PanPeryskop

final class FlightPickerRulesTests: XCTestCase {
    private let fmt: DateFormatter = {
        let f = DateFormatter()
        f.calendar = AppConstants.warsawCalendar
        f.timeZone = AppConstants.warsawCalendar.timeZone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private func date(_ day: String) -> Date { fmt.date(from: day)! }
    private var maxNights: Int { AppConstants.cityBreakMaxNights }

    func testNightsAcrossAMonthChange() {
        XCTAssertEqual(FlightPickerRules.nights(from: "2026-03-30", to: "2026-04-02"), 3)
    }

    func testNightsAcrossTheClockChange() {
        XCTAssertEqual(FlightPickerRules.nights(from: "2026-03-28", to: "2026-03-31"), 3)
    }

    func testNightsFromAnUnparsableDayIsNil() {
        XCTAssertNil(FlightPickerRules.nights(from: "nonsense", to: "2026-03-31"))
    }

    func testSameDayIsNotAReturn() {
        XCTAssertFalse(FlightPickerRules.isReturnAllowed("2026-03-10", after: "2026-03-10", maxNights: maxNights))
    }

    func testOneNightIsAllowed() {
        XCTAssertTrue(FlightPickerRules.isReturnAllowed("2026-03-11", after: "2026-03-10", maxNights: maxNights))
    }

    func testExactlyTheMaximumIsAllowed() {
        XCTAssertTrue(FlightPickerRules.isReturnAllowed("2026-03-17", after: "2026-03-10", maxNights: maxNights))
    }

    func testOneNightPastTheMaximumIsRefused() {
        XCTAssertFalse(FlightPickerRules.isReturnAllowed("2026-03-18", after: "2026-03-10", maxNights: maxNights))
    }

    func testAReturnBeforeTheOutboundIsRefused() {
        XCTAssertFalse(FlightPickerRules.isReturnAllowed("2026-03-08", after: "2026-03-10", maxNights: maxNights))
    }

    func testLatestReturnIsTheOutboundPlusTheMaximum() {
        XCTAssertEqual(FlightPickerRules.latestReturn(after: "2026-03-10", maxNights: maxNights), "2026-03-17")
    }

    func testLatestReturnAcrossTheClockChange() {
        XCTAssertEqual(FlightPickerRules.latestReturn(after: "2026-03-28", maxNights: maxNights), "2026-04-04")
    }

    func testOpeningMonthEarlyInTheMonthIsTheSameMonth() {
        let opened = FlightPickerRules.openingMonth(now: date("2026-03-05"), maxNights: maxNights)
        XCTAssertEqual(opened, FlightPickerRules.monthStart(date("2026-03-01")))
    }

    func testOpeningMonthWithTooFewDaysLeftIsTheNextMonth() {
        let opened = FlightPickerRules.openingMonth(now: date("2026-03-28"), maxNights: maxNights)
        XCTAssertEqual(opened, FlightPickerRules.monthStart(date("2026-04-01")))
    }

    func testOpeningMonthAtTheEndOfDecemberIsJanuary() {
        let opened = FlightPickerRules.openingMonth(now: date("2026-12-30"), maxNights: maxNights)
        XCTAssertEqual(opened, FlightPickerRules.monthStart(date("2027-01-01")))
    }

    func testOpeningMonthAtTheExactBoundaryStays() {
        let days = AppConstants.warsawCalendar.range(of: .day, in: .month, for: date("2026-03-01"))!.count
        let boundary = date("2026-03-\(days - maxNights)")
        XCTAssertEqual(
            FlightPickerRules.openingMonth(now: boundary, maxNights: maxNights),
            FlightPickerRules.monthStart(date("2026-03-01"))
        )
    }
}
