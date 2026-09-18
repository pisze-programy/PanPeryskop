import SwiftUI
import MapKit

extension FlightArc {
    var polyline: MKPolyline {
        var coords = ArcBuilder.curve(from: from, to: to, bowOffset: bowOffset)
        if progress < 1 {
            coords = Array(coords.prefix(max(2, Int(Double(coords.count) * progress))))
        }
        return MKPolyline(coordinates: &coords, count: coords.count)
    }

    var color: Color {
        airlines.contains(.wizzair) ? Airline.wizzair.color : Airline.ryanair.color
    }

    /// Both carriers on one route — draws a two-colour arc.
    var isDualCarrier: Bool {
        airlines.contains(.ryanair) && airlines.contains(.wizzair)
    }
}
