import XCTest
@testable import PanPeryskop

/// City → airports and the merged destination list of a city.
@MainActor
final class CityAirportTests: XCTestCase {
    private let catalogue = CatalogueStore.shared.catalogue

    private func airport(_ iata: String) -> Airport {
        catalogue.airports.first { $0.iata == iata }!
    }

    func testWarsawHasTwoAirportsAndOthersHaveOne() {
        XCTAssertEqual(catalogue.city(id: "warszawa")?.airports, ["WAW", "WMI"])
        XCTAssertEqual(catalogue.city(id: "poznan")?.airports, ["POZ"])
        XCTAssertEqual(catalogue.city(id: "bialystok")?.airports, ["SZY"])
    }

    func testEveryOriginCityMapsToKnownAirports() {
        for city in catalogue.cities {
            let airports = catalogue.originAirports(for: city.id)
            XCTAssertFalse(airports.isEmpty, "\(city.id) has no airport")
            for airport in airports {
                XCTAssertNotNil(
                    catalogue.airports.first { $0.iata == airport.iata },
                    "\(airport.iata) for \(city.id) is not in the airport catalog"
                )
            }
        }
    }

    func testMergeKeepsOneEntryPerDestination() {
        let merged = TripsViewModel.mergeDestinations([airport("WAW"), airport("WMI")], catalogue: catalogue)
        let iatas = merged.map(\.iata)
        XCTAssertEqual(Set(iatas).count, iatas.count, "a destination appears twice")
    }

    func testMergeUnionsCarriersOfSharedDestinations() {
        let merged = TripsViewModel.mergeDestinations([airport("WAW"), airport("WMI")], catalogue: catalogue)
        for dest in merged {
            let fromWaw = catalogue.destinations["WAW"]?.first { $0.iata == dest.iata }
            let fromWmi = catalogue.destinations["WMI"]?.first { $0.iata == dest.iata }
            let expected = Set((fromWaw?.providers ?? []) + (fromWmi?.providers ?? []))
            XCTAssertEqual(Set(dest.providers), expected, "wrong carriers for \(dest.iata)")
        }
    }

    func testMergeAddsDestinationsOnlyWmiServes() {
        let merged = TripsViewModel.mergeDestinations([airport("WAW"), airport("WMI")], catalogue: catalogue)
        let wmiOnly = (catalogue.destinations["WMI"] ?? [])
            .filter { dest in catalogue.destinations["WAW"]?.contains { $0.iata == dest.iata } == false }
        XCTAssertFalse(wmiOnly.isEmpty, "test needs a WMI-only destination")
        for dest in wmiOnly {
            XCTAssertTrue(merged.contains { $0.iata == dest.iata }, "\(dest.iata) is missing")
        }
    }

    func testMergeSingleAirportReturnsItsDestinations() {
        let merged = TripsViewModel.mergeDestinations([airport("KRK")], catalogue: catalogue)
        XCTAssertEqual(merged.count, catalogue.destinations["KRK"]?.count)
    }

    private func destination(_ iata: String, _ providers: [Airline]) -> Destination {
        Destination(
            iata: iata, name: iata, city: iata, country: "Poland",
            lat: 0, lng: 0, providers: providers
        )
    }

    func testFlightOptionsMakeOneEntryPerCarrier() {
        let options = TripsViewModel.flightOptions(for: [
            destination("LON", [.ryanair, .wizzair]),
            destination("DUB", [.ryanair]),
        ])
        XCTAssertEqual(Set(options.map(\.id)), ["LON|ryanair", "LON|wizzair", "DUB|ryanair"])
        XCTAssertEqual(options.count, 3)
    }

    func testFlightOptionsAreEmptyForNoDestinations() {
        XCTAssertTrue(TripsViewModel.flightOptions(for: []).isEmpty)
    }

    func testOriginPicksAirportThatServesDestination() {
        let origins = [airport("WAW"), airport("WMI")]
        let wmiOnly = catalogue.destinations["WMI"]!
            .first { dest in catalogue.destinations["WAW"]?.contains { $0.iata == dest.iata } == false }!
        let wawOnly = catalogue.destinations["WAW"]!
            .first { dest in catalogue.destinations["WMI"]?.contains { $0.iata == dest.iata } == false }!
        XCTAssertEqual(TripsViewModel.origin(for: wmiOnly, among: origins, catalogue: catalogue).iata, "WMI")
        XCTAssertEqual(TripsViewModel.origin(for: wawOnly, among: origins, catalogue: catalogue).iata, "WAW")
    }

    func testOriginFallsBackToFirstAirport() {
        let origins = [airport("WAW"), airport("WMI")]
        let unknown = destination("XXX", [.ryanair])
        XCTAssertEqual(TripsViewModel.origin(for: unknown, among: origins, catalogue: catalogue).iata, "WAW")
    }

    func testSyncCitySwapsAirportsAndDropsOldCityPins() {
        let key = "trips.last_city_id"
        let saved = UserDefaults.standard.string(forKey: key)
        defer {
            if let saved { UserDefaults.standard.set(saved, forKey: key) }
            else { UserDefaults.standard.removeObject(forKey: key) }
        }
        let viewModel = TripsViewModel()
        let other = catalogue.cities.first { $0.id != viewModel.selectedCity.id }!.city
        viewModel.syncCity(other)
        XCTAssertEqual(viewModel.selectedCity.id, other.id)
        XCTAssertEqual(viewModel.originIatas, catalogue.originAirports(for: other.id).map(\.iata))
        XCTAssertTrue(viewModel.events.isEmpty)
    }
}
