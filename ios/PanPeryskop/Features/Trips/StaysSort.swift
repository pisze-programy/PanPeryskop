import Foundation

struct StaysSort: Equatable {
    static let nightly = "nightly"
    static let total = "total"

    var priceper: String = nightly
    var minstars: Int?
    var minguest: Int?

    static let priceOptions: [(String, String)] = [
        (nightly, "Za noc"),
        (total, "Za całość"),
    ]
    static let starOptions: [(Int?, String)] = [
        (nil, "Dowolny"),
        (3, "3 gwiazdki i więcej"),
        (4, "4 gwiazdki i więcej"),
        (5, "5 gwiazdek"),
    ]
    static let guestOptions: [(Int?, String)] = [
        (nil, "Dowolna"),
        (8, "8+/10"),
        (9, "9+/10"),
    ]

    var isActive: Bool {
        priceper != Self.nightly || minstars != nil || minguest != nil
    }
}
