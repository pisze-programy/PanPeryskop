import XCTest
import CoreLocation
@testable import PanPeryskop

final class ArcBuilderTests: XCTestCase {
    func testCurveIsBowedAndKeepsEndpoints() {
        let a = CLLocationCoordinate2D(latitude: 52.16, longitude: 16.83)
        let b = CLLocationCoordinate2D(latitude: 41.29, longitude: 2.07)
        let pts = ArcBuilder.curve(from: a, to: b, steps: 48)
        XCTAssertEqual(pts.count, 49)
        XCTAssertEqual(pts.first!.latitude, a.latitude, accuracy: 1e-9)
        XCTAssertEqual(pts.last!.longitude, b.longitude, accuracy: 1e-9)
        // The midpoint deviates from the straight chord — it is an arc.
        let mid = pts[pts.count / 2]
        let chordMidLat = (a.latitude + b.latitude) / 2
        XCTAssertGreaterThan(abs(mid.latitude - chordMidLat), 0.001)
    }

    func testDegenerateRouteIsAStraightSegment() {
        let a = CLLocationCoordinate2D(latitude: 50, longitude: 20)
        XCTAssertEqual(ArcBuilder.curve(from: a, to: a).count, 2)
    }
}
