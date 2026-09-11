import SwiftUI
import MapKit

extension FlightArc {
    var polyline: MKPolyline {
        var coords = [from, to]
        return MKGeodesicPolyline(coordinates: &coords, count: coords.count)
    }

    var color: Color { airline.color }
}
