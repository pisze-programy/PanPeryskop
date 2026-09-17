import Foundation

struct StaysWidgetResponse: Decodable {
    let url: String
}

enum StaysView: String {
    case mini
    case full
}

struct StaysWidgetQuery {
    let point: StaysAnchorPoint
    let checkin: String
    let checkout: String
    let theme: String
    let view: StaysView
    var priceper: String?
    var minstars: Int?
    var minguest: Int?

    var key: String {
        [
            view.rawValue,
            checkin,
            checkout,
            theme,
            priceper ?? "",
            String(minstars ?? 0),
            String(minguest ?? 0),
            point.key,
        ].joined(separator: "|")
    }
}
