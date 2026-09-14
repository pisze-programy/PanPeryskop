import Foundation

enum TripsSheetSection: CaseIterable, Identifiable {
    case hero
    case flights
    case stays
    case attractions
    case transport
    case cars
    case insurance

    var id: Self { self }

    static func sections(for event: TravelEvent) -> [TripsSheetSection] {
        // Transport, cars and insurance are hidden until their data exists.
        [.hero, .flights, .stays, .attractions]
    }
}
