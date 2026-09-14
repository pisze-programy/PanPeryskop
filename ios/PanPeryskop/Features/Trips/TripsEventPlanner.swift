import Foundation

/// One event's planning state, shared by the sheet sections so they can react to
/// each other: the chosen destination airport feeds the flight timeline, and the
/// transport section reads both the arrival airport and the chosen hotel.
@MainActor
final class TripsEventPlanner: ObservableObject {
    /// Chosen destination airport (flight arrival). nil = first reachable.
    @Published var destination: Destination?
    @Published var outbound: FlightWindowCell?
    @Published var returning: FlightWindowCell?
    /// Chosen hotel — the transport route destination.
    @Published var hotel: TravelPlace?
    /// Chosen attraction and rental car (kept for the see-more / transport flows).
    @Published var attraction: TravelPlace?
    @Published var car: TravelPlace?

    /// True once both a flight and a hotel are picked (transport can route).
    var canRouteTransport: Bool { outbound != nil && hotel != nil }

    func clearFlightSelection() {
        outbound = nil
        returning = nil
    }
}
