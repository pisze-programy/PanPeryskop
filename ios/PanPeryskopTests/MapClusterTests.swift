import XCTest
import MapKit
@testable import PanPeryskop

final class MapClusterTests: XCTestCase {
    private func item(_ id: String, _ lat: Double, _ lng: Double) throws -> MapClusterItem {
        let json = """
        {"id":"\(id)","user_id":"seed","type":"photo","lat":\(lat),"lng":\(lng),
         "description":"Event: 12:00, Venue","media_key":null,"thumb_key":null,
         "created_at":0,"likes_count":0,"views_count":0,"shares_count":0,
         "dislikes_count":0,"grid_cell_id":null,"liked":false,"disliked":false,
         "watched":false,"author_name":"seed","media_url":null,"thumb_url":null,
         "author_avatar_url":null,"category":"events"}
        """
        let post = try JSONDecoder().decode(Post.self, from: Data(json.utf8))
        return .post(post)
    }

    private func warsaw() throws -> [MapClusterItem] {
        [
            try item("a", 52.2297, 21.0122),
            try item("b", 52.2300, 21.0125),
            try item("c", 52.2295, 21.0120),
            try item("d", 52.2400, 21.0200),
            try item("e", 52.2402, 21.0203),
            try item("f", 52.2600, 21.0500),
        ]
    }

    func testContinentalConfigKeepsTheCurrentBehaviour() throws {
        let clusters = clusterItems(try warsaw(), radiusDegrees: 0.0005, config: .continental)
        XCTAssertGreaterThan(clusters.count, 1)
    }

    func testLocalConfigGroupsNeighboursIntoLargerClusters() throws {
        let items = try warsaw()
        let continental = clusterItems(items, radiusDegrees: 0.0005, config: .continental)
        let local = clusterItems(items, radiusDegrees: 0.0005, config: .local)
        XCTAssertLessThan(local.count, continental.count)
    }

    func testLocalConfigScalesTheLongitudeRadius() throws {
        let clusters = clusterItems(try warsaw(), radiusDegrees: 0.0005, config: .local)
        let radiusLng = 0.0005 / cos(52.0 * .pi / 180)
        for cluster in clusters {
            for member in cluster.items {
                let expectedLat = Int((member.lat - 52.0) / 0.0005)
                let expectedLng = Int((member.lng - 21.0) / radiusLng)
                XCTAssertEqual(cluster.id, "\(expectedLat):\(expectedLng)")
            }
        }
    }

    func testAnEmptySetReturnsNothing() {
        XCTAssertTrue(clusterItems([], radiusDegrees: 0.0005).isEmpty)
    }

    func testAZeroRadiusReturnsNothing() throws {
        XCTAssertTrue(clusterItems(try warsaw(), radiusDegrees: 0).isEmpty)
    }

    func testClusterCentreIsTheAverageOfItsMembers() throws {
        let clusters = clusterItems(try warsaw(), radiusDegrees: 0.0005, config: .local)
        for cluster in clusters {
            let lat = cluster.items.map(\.lat).reduce(0, +) / Double(cluster.count)
            let lng = cluster.items.map(\.lng).reduce(0, +) / Double(cluster.count)
            XCTAssertEqual(cluster.coord.latitude, lat, accuracy: 0.000001)
            XCTAssertEqual(cluster.coord.longitude, lng, accuracy: 0.000001)
        }
    }

    func testEveryItemLandsInExactlyOneCluster() throws {
        let items = try warsaw()
        let clusters = clusterItems(items, radiusDegrees: 0.0005, config: .local)
        let ids = clusters.flatMap { $0.items.map(\.id) }
        XCTAssertEqual(ids.count, items.count)
        XCTAssertEqual(Set(ids).count, items.count)
    }
}
