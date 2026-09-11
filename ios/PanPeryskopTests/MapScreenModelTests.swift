import XCTest
import CoreLocation
@testable import PanPeryskop

@MainActor
final class MapScreenModelTests: XCTestCase {
    private let coord = CLLocationCoordinate2D(latitude: 52.4, longitude: 16.9)

    func testRequestDropShowsConfirmWhenReady() {
        let m = MapScreenModel()
        m.requestDrop(at: coord, isLive: true, spotsEmpty: true, cooldownSeconds: 0)
        XCTAssertTrue(m.showConfirmAlert)
        XCTAssertNotNil(m.pendingRequestDrop)
        XCTAssertNotNil(m.previewRequestPin)
    }

    func testRequestDropShowsCooldownWhenActive() {
        let m = MapScreenModel()
        m.requestDrop(at: coord, isLive: true, spotsEmpty: true, cooldownSeconds: 120)
        XCTAssertTrue(m.showCooldownAlert)
        XCTAssertEqual(m.cooldownMinutes, 2)
        XCTAssertNil(m.pendingRequestDrop)
    }

    func testRequestDropIgnoredWhenNotLiveOrBusy() {
        let m = MapScreenModel()
        m.requestDrop(at: coord, isLive: false, spotsEmpty: true, cooldownSeconds: 0)
        m.requestDrop(at: coord, isLive: true, spotsEmpty: false, cooldownSeconds: 0)
        XCTAssertFalse(m.showConfirmAlert)
        XCTAssertFalse(m.showCooldownAlert)
        XCTAssertNil(m.previewRequestPin)
    }

    func testCooldownMessage() {
        let m = MapScreenModel()
        m.cooldownMinutes = 1
        XCTAssertEqual(m.cooldownMessage, "Dodałeś już pin zapytania. Możesz dodać kolejny za 1 minutę.")
        m.cooldownMinutes = 5
        XCTAssertEqual(m.cooldownMessage, "Dodałeś już pin zapytania. Możesz dodać kolejny za 5 min.")
    }
}