import XCTest
@testable import PanPeryskop

final class PlaceScoringTests: XCTestCase {
    private func place(_ id: String, price: Int, rating: Double, reviews: Int) -> TravelPlace {
        TravelPlace(
            id: id, kind: .hotel, name: id, image: "", price: price, currency: "PLN",
            address: "", lat: 0, lng: 0, link: "", tier: .recommended, rating: rating, reviews: reviews
        )
    }

    func testEconomySortsByPriceAscending() {
        let a = place("a", price: 500, rating: 4.9, reviews: 900)
        let b = place("b", price: 100, rating: 3.0, reviews: 10)
        XCTAssertEqual(PlaceScoring.sorted([a, b], by: .economy).map(\.id), ["b", "a"])
    }

    func testRecommendedPrefersCheapAndWellRated() {
        let cheap = place("cheap", price: 100, rating: 4.8, reviews: 800)
        let pricey = place("pricey", price: 900, rating: 3.0, reviews: 5)
        XCTAssertEqual(PlaceScoring.sorted([pricey, cheap], by: .recommended).first?.id, "cheap")
    }

    func testPremiumPrefersExpensiveAndWellReviewed() {
        let cheap = place("cheap", price: 100, rating: 4.8, reviews: 800)
        let pricey = place("pricey", price: 900, rating: 4.5, reviews: 1500)
        XCTAssertEqual(PlaceScoring.sorted([cheap, pricey], by: .premium).first?.id, "pricey")
    }
}
