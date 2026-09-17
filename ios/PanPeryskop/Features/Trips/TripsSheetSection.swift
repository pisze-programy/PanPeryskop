import Foundation

enum TripsSheetSection: CaseIterable, Identifiable {
    case hero
    case flights
    case stays
    case attractions

    var id: Self { self }

    static func sections(for event: TravelEvent) -> [TripsSheetSection] {
        [.hero, .flights, .stays, .attractions]
    }
}
