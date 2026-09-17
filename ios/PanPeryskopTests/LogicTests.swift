import XCTest
@testable import PanPeryskop

final class FlightScoringTests: XCTestCase {
    private let fmt: DateFormatter = {
        let f = DateFormatter()
        f.calendar = AppConstants.warsawCalendar
        f.timeZone = AppConstants.warsawCalendar.timeZone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private func date(_ day: String) -> Date { fmt.date(from: day)! }
    private func cell(_ day: String, _ price: Double?) -> FlightCell {
        FlightCell(date: date(day), hour: "10:00", price: price)
    }

    func testNoPairWhenNothingStrictlySpansEvent() {
        // Outbound on the event day doesn't satisfy out < event.
        let out = [cell("2026-09-10", 50)]
        let ret = [cell("2026-09-11", 50)]
        XCTAssertNil(FlightScoring.findBestFlight(outbound: out, returning: ret, eventDate: date("2026-09-10")))
    }

    func testNoPairWhenAPriceIsMissing() {
        let out = [cell("2026-09-09", nil)]
        let ret = [cell("2026-09-11", 50)]
        XCTAssertNil(FlightScoring.findBestFlight(outbound: out, returning: ret, eventDate: date("2026-09-10")))
    }

    func testPaysMoreToAvoidHotelNights() {
        // The real case: 107 zl a week before, 173 zl two days before, 245 zl the
        // day before, one return at 65 zl, event on 28.11. The day before wins.
        let out = [cell("2026-11-22", 107), cell("2026-11-23", 173), cell("2026-11-27", 245)]
        let ret = [cell("2026-11-29", 65)]
        let best = FlightScoring.findBestFlight(outbound: out, returning: ret, eventDate: date("2026-11-28"))
        XCTAssertEqual(best?.outbound.date, date("2026-11-27"))
        XCTAssertEqual(best?.returning.date, date("2026-11-29"))
        XCTAssertEqual(best?.total, 310)
        XCTAssertEqual(best?.nights, 2)
    }

    func testFewerNightsBeatACheaperFare() {
        // 90 zl over four nights loses to 110 zl over two nights.
        let out = [cell("2026-09-07", 100), cell("2026-09-09", 50)]
        let ret = [cell("2026-09-11", 60), cell("2026-09-13", 40)]
        let best = FlightScoring.findBestFlight(outbound: out, returning: ret, eventDate: date("2026-09-10"))
        XCTAssertEqual(best?.outbound.date, date("2026-09-09"))
        XCTAssertEqual(best?.returning.date, date("2026-09-11"))
        XCTAssertEqual(best?.total, 110)
        XCTAssertEqual(best?.nights, 2)
    }

    func testHotelCostCountsEveryNight() {
        // Wednesday to Friday: two weekday nights.
        let out = [cell("2026-09-16", 100)]
        let ret = [cell("2026-09-18", 100)]
        let best = FlightScoring.findBestFlight(outbound: out, returning: ret, eventDate: date("2026-09-17"))
        XCTAssertEqual(best?.nights, 2)
        XCTAssertEqual(best?.hotelCost, 700)
        XCTAssertEqual(best?.generalizedCost, 900)
    }

    func testSaturdayNightCostsMore() {
        // Saturday 19.09 to Tuesday 22.09: Sat 500 + Sun 350 + Mon 350.
        let out = [cell("2026-09-19", 100)]
        let ret = [cell("2026-09-22", 100)]
        let best = FlightScoring.findBestFlight(outbound: out, returning: ret, eventDate: date("2026-09-21"))
        XCTAssertEqual(best?.nights, 3)
        XCTAssertEqual(best?.hotelCost, 1200)
        XCTAssertEqual(best?.generalizedCost, 1400)
    }

    func testShortestTripWinsAmongEqualPrices() {
        let out = [cell("2026-09-09", 60)]
        let ret = [cell("2026-09-11", 60), cell("2026-09-13", 60)]
        let best = FlightScoring.findBestFlight(outbound: out, returning: ret, eventDate: date("2026-09-10"))
        XCTAssertEqual(best?.returning.date, date("2026-09-11"))  // 2 nights beat 4
    }
}

final class TagSortingTests: XCTestCase {
    private func tag(_ id: String, _ label: String) -> TagPill { TagPill(id: id, label: label) }

    func testCountsDescendingThenAlphabetical() {
        let tags = [tag("b", "B"), tag("a", "A"), tag("c", "C"), tag("inne", "Inne")]
        let sorted = TagSorting.sorted(tags, counts: ["a": 5, "b": 5, "c": 0, "inne": 0])
        XCTAssertEqual(sorted.map(\.id), ["a", "b", "c", "inne"])
    }

    func testInnePushedLastWhenEmptyAmongMultipleZeros() {
        // Alphabetically "Inne" < "Z", so only the rule can put "z" first.
        let tags = [tag("z", "Z"), tag("inne", "Inne")]
        XCTAssertEqual(TagSorting.sorted(tags, counts: ["z": 0, "inne": 0]).map(\.id), ["z", "inne"])
    }

    func testInneOrderedByCountWhenItHasEvents() {
        let tags = [tag("a", "A"), tag("inne", "Inne"), tag("b", "B")]
        XCTAssertEqual(TagSorting.sorted(tags, counts: ["a": 0, "b": 0, "inne": 3]).map(\.id), ["inne", "a", "b"])
    }

    func testInneAlphabeticalWhenItIsTheOnlyEmptyTag() {
        let tags = [tag("inse", "Inse"), tag("a", "A"), tag("b", "B")]
        XCTAssertEqual(TagSorting.sorted(tags, counts: ["a": 5, "b": 5, "inse": 0]).map(\.id), ["a", "b", "inse"])
    }
}