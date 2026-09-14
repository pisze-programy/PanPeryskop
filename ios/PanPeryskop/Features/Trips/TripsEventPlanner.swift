import Foundation

/// Shared planning state for one event's sheet sections.
@MainActor
final class TripsEventPlanner: ObservableObject {
    @Published var destination: Destination?
    @Published var outbound: FlightWindowCell?
    @Published var returning: FlightWindowCell?
    @Published var hotel: TravelPlace?
    @Published var attraction: TravelPlace?
    @Published var car: TravelPlace?

    func clearFlightSelection() {
        outbound = nil
        returning = nil
    }
}
