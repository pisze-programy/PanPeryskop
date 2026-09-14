import Foundation

/// The sections of the Wycieczki event sheet, in display order. This is the
/// extension point: add a case here and a branch in the page's `sectionView`,
/// and future tags (piłka nożna, biegi, city-break) reuse the same components.
enum TripsSheetSection: CaseIterable, Identifiable {
    case hero
    case flights
    case stays
    case attractions
    case transport
    case cars
    case insurance

    var id: Self { self }

    /// Sections for an event. Every section applies to every tag today.
    static func sections(for event: TravelEvent) -> [TripsSheetSection] {
        allCases
    }
}
