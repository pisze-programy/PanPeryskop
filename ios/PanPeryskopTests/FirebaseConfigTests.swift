import XCTest
@testable import PanPeryskop

final class FirebaseConfigTests: XCTestCase {
    private func config() throws -> [String: Any] {
        let bundles = [Bundle.main, Bundle(for: Self.self)]
        let url = try XCTUnwrap(
            bundles.compactMap { $0.url(forResource: "GoogleService-Info", withExtension: "plist") }.first,
            "GoogleService-Info.plist is not in the app bundle"
        )
        let data = try Data(contentsOf: url)
        return try XCTUnwrap(
            PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        )
    }

    func testConfigEnablesAnalytics() throws {
        XCTAssertEqual(
            try config()["IS_ANALYTICS_ENABLED"] as? Bool,
            true,
            "The Firebase console writes IS_ANALYTICS_ENABLED=false into a fresh download. With false the app collects and uploads, and nothing reaches the property. Set it back to true after every download."
        )
    }

    func testConfigPointsAtOurProject() throws {
        let plist = try config()
        XCTAssertEqual(plist["GOOGLE_APP_ID"] as? String, "1:718990475380:ios:1b00b846ad8c099a431121")
        XCTAssertEqual(plist["BUNDLE_ID"] as? String, "pl.piszeprogramy.panperyskop")
    }
}
