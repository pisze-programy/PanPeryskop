import Foundation

struct LocalDaySection: Identifiable, Equatable {
    let dayOffset: Int
    let isoDay: String
    let title: String
    let posts: [Post]

    var id: String { isoDay }
}
