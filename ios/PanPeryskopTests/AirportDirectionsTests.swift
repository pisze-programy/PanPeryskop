import XCTest
import CoreLocation
@testable import PanPeryskop

final class AirportDirectionsTests: XCTestCase {
    private let warsaw = CLLocationCoordinate2D(latitude: 52.2297, longitude: 21.0122)
    private let okecie = CLLocationCoordinate2D(latitude: 52.1657, longitude: 20.9671)

    func testDistanceIsRoundedKilometres() {
        let km = AirportDirections.distanceKm(from: warsaw, to: okecie)
        XCTAssertEqual(km, 8)
    }

    func testDistanceOfTheSamePointIsZero() {
        XCTAssertEqual(AirportDirections.distanceKm(from: warsaw, to: warsaw), 0)
    }

    func testTheTransitWebURLCarriesBothPoints() {
        let url = AirportDirections.webURL(from: okecie, to: warsaw)
        XCTAssertTrue(url.contains("origin=52.1657,20.9671"))
        XCTAssertTrue(url.contains("destination=52.2297,21.0122"))
        XCTAssertTrue(url.contains("travelmode=transit"))
    }

    func testTheGoogleMapsAppURLUsesTheTransitMode() {
        let url = AirportDirections.googleMapsAppURL(from: okecie, to: warsaw)
        XCTAssertNotNil(url)
        XCTAssertTrue(url!.absoluteString.hasPrefix("comgooglemaps://"))
        XCTAssertTrue(url!.absoluteString.contains("saddr=52.1657,20.9671"))
        XCTAssertTrue(url!.absoluteString.contains("daddr=52.2297,21.0122"))
        XCTAssertTrue(url!.absoluteString.contains("directionsmode=transit"))
    }

}
