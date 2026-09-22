import MapKit

/// A group of cities that share one band cell. The map shows the count instead
/// of one pin per city, so a dense area stays readable. A tap opens the largest
/// city of the group.
struct CityCluster: Identifiable {
    let id: String
    let coord: CLLocationCoordinate2D
    let count: Int
    let lead: TravelCity
}
