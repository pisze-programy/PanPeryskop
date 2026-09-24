import Foundation

extension Notification.Name {
    static let scrollToPost = Notification.Name("scrollToPost")
    static let centerMapOnCoordinate = Notification.Name("centerMapOnCoordinate")
}

/// Boxed coordinate for `.centerMapOnCoordinate` (NotificationCenter needs a reference type).
final class MapCenterPayload: NSObject {
    let lat: Double
    let lng: Double
    /// When true the map zooms in on the coordinate; otherwise it keeps the current zoom.
    let zoomIn: Bool
    init(lat: Double, lng: Double, zoomIn: Bool = false) {
        self.lat = lat
        self.lng = lng
        self.zoomIn = zoomIn
        super.init()
    }
}