import Foundation

struct EuropaDaySection: Identifiable, Equatable {
    let dayOffset: Int
    let isoDay: String
    let title: String
    let events: [TravelEvent]
    let items: [EuropaSectionItem]

    var id: String { isoDay }
}
