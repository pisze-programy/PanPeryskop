import XCTest
@testable import PanPeryskop

final class CityPhotoRatioTests: XCTestCase {
    func testNearbyCardPhotoIsTwoToOne() {
        let ratio = CityNearbySection.cardWidth / CityNearbySection.photoHeight
        XCTAssertEqual(
            ratio,
            2,
            accuracy: 0.0001,
            "The card frame must stay 2:1. The bundled thumb (240x120) and the card photo (w=600&h=300) are 2:1, so a different frame crops them differently and the picture jumps on load."
        )
    }
}
