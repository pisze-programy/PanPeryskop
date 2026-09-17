import XCTest
@testable import PanPeryskop

@MainActor
final class DateTests: XCTestCase {
    private let cal = AppConstants.warsawCalendar

    func testIsoDayFormatter() {
        let d = cal.date(from: DateComponents(year: 2026, month: 9, day: 11))!
        XCTAssertEqual(AppConstants.isoDayFormatter.string(from: d), "2026-09-11")
    }

    func testShortDayFormatter() {
        let d = cal.date(from: DateComponents(year: 2026, month: 9, day: 5))!
        XCTAssertEqual(AppConstants.shortDayFormatter.string(from: d), "05.09")
    }

    func testDayRangeCoversTheWarsawDay() {
        let vm = TripsViewModel()
        let today = cal.startOfDay(for: Date())
        let (from, to) = vm.dayRange(offset: 0)
        XCTAssertEqual(from, Int64(today.timeIntervalSince1970 * 1000))
        let endOfDay = cal.date(byAdding: .day, value: 1, to: today)!
        XCTAssertEqual(to, Int64(endOfDay.timeIntervalSince1970 * 1000) - 1)
    }

    func testDayRangeOffsetAddsWholeDays() {
        let vm = TripsViewModel()
        let today = cal.startOfDay(for: Date())
        let (from, _) = vm.dayRange(offset: 3)
        let expected = cal.date(byAdding: .day, value: 3, to: today)!
        XCTAssertEqual(from, Int64(expected.timeIntervalSince1970 * 1000))
    }

    func testRelativeWords() {
        XCTAssertEqual(DayLabels.relative(offset: 0), "Dziś")
        XCTAssertEqual(DayLabels.relative(offset: 1), "Jutro")
        XCTAssertNil(DayLabels.relative(offset: 2))
    }

    func testPillUsesShortDates() {
        XCTAssertEqual(DayLabels.pill(offset: 0), "Dziś")
        XCTAssertEqual(DayLabels.pill(offset: 1), "Jutro")
        let expected = AppConstants.shortDayFormatter.string(from: DayLabels.date(offset: 5))
        XCTAssertEqual(DayLabels.pill(offset: 5), expected)
    }

    func testTitleKeepsTheFullDate() {
        let date = DayLabels.date(offset: 5)
        let expected = "\(AppConstants.dayMonthFormatter.string(from: date)), \(AppConstants.weekdayFullFormatter.string(from: date).capitalized)"
        XCTAssertEqual(DayLabels.title(offset: 5), expected)
    }
}