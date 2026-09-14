import Foundation

@MainActor
final class TripsEventPlanner: ObservableObject {
    @Published var destination: Destination?
    @Published var outbound: FlightWindowCell?
    @Published var returning: FlightWindowCell?
    @Published var hotel: TravelPlace?
    @Published var attraction: TravelPlace?
    @Published var car: TravelPlace?

    var nights: Int {
        guard let out = outbound?.date, let back = returning?.date,
              let from = AppConstants.isoDayFormatter.date(from: out),
              let to = AppConstants.isoDayFormatter.date(from: back) else { return 1 }
        return max(1, Calendar.current.dateComponents([.day], from: from, to: to).day ?? 1)
    }

    func clearFlightSelection() {
        outbound = nil
        returning = nil
    }
}
