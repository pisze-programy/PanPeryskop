import Foundation

/// Sorts places within a filter tier. Port of the reference HotelWidget scoring:
/// cheap = lowest price, best = balanced price/rating/reviews, luxury = the
/// opposite (high price, reviews and rating). Pure logic — unit tested.
enum PlaceScoring {
    static func sorted(_ places: [TravelPlace], by tier: HotelTier) -> [TravelPlace] {
        switch tier {
        case .economy:
            return places.sorted { $0.price < $1.price }
        case .recommended:
            return places.sorted {
                score($0, in: places, weights: (0.5, 0.3, 0.2)) < score($1, in: places, weights: (0.5, 0.3, 0.2))
            }
        case .premium:
            return places.sorted {
                score($0, in: places, weights: (0.7, 0.2, 0.1)) > score($1, in: places, weights: (0.7, 0.2, 0.1))
            }
        }
    }

    /// Lower is better: cheap price, high rating, many reviews.
    private static func score(
        _ place: TravelPlace,
        in places: [TravelPlace],
        weights: (alpha: Double, beta: Double, gamma: Double)
    ) -> Double {
        let prices = places.map { Double($0.price) }
        let ratings = places.compactMap(\.rating)
        let reviews = places.compactMap { $0.reviews.map(Double.init) }
        guard let minP = prices.min(), let maxP = prices.max(),
              let minR = ratings.min(), let maxR = ratings.max(),
              let minRev = reviews.min(), let maxRev = reviews.max()
        else { return 0 }

        let price = norm(Double(place.price), minP, maxP)
        let rating = 1 - norm(place.rating ?? minR, minR, maxR)
        let review = 1 - norm(Double(place.reviews ?? Int(minRev)), minRev, maxRev)
        return weights.alpha * price + weights.beta * rating + weights.gamma * review
    }

    private static func norm(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
        hi > lo ? (v - lo) / (hi - lo) : 0
    }
}
