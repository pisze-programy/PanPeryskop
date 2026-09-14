import Foundation

/// Sheet sections in display order. Add a case here to extend the sheet.
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
        allCases
    }
}
