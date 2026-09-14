import SwiftUI
import MapKit

extension FlightArc {
    var polyline: MKPolyline {
        var coords = ArcBuilder.curve(from: from, to: to)
        return MKPolyline(coordinates: &coords, count: coords.count)
    }

    var color: Color { airline.color }
}
