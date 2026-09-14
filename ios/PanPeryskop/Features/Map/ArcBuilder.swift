import CoreLocation

enum ArcBuilder {
    static func curve(
        from: CLLocationCoordinate2D,
        to: CLLocationCoordinate2D,
        steps: Int = 48
    ) -> [CLLocationCoordinate2D] {
        let dLat = to.latitude - from.latitude
        let dLng = to.longitude - from.longitude
        let chord = (dLat * dLat + dLng * dLng).squareRoot()
        guard chord > 0, steps >= 2 else { return [from, to] }

        // Perpendicular to the chord, in degrees (longitude is not cos-scaled —
        // fine at European distances). Bow = 25% of the chord, capped.
        let nx = -dLng / chord
        let ny = dLat / chord
        let bow = min(chord * 0.25, 2.0)
        let midLat = (from.latitude + to.latitude) / 2
        let midLng = (from.longitude + to.longitude) / 2
        let control = CLLocationCoordinate2D(
            latitude: midLat + ny * bow,
            longitude: midLng + nx * bow
        )

        return (0...steps).map { i in
            let t = Double(i) / Double(steps)
            let mt = 1 - t
            let a = mt * mt
            let b = 2 * mt * t
            let c = t * t
            return CLLocationCoordinate2D(
                latitude: a * from.latitude + b * control.latitude + c * to.latitude,
                longitude: a * from.longitude + b * control.longitude + c * to.longitude
            )
        }
    }
}
