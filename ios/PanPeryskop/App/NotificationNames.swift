import Foundation

extension Notification.Name {
    static let scrollToPost = Notification.Name("scrollToPost")
    static let didCaptureMedia = Notification.Name("didCaptureMedia")
    /// Center the map on a coordinate (keeps the current zoom) — e.g. after a new post uploads.
    static let centerMapOnCoordinate = Notification.Name("centerMapOnCoordinate")
}

/// Boxed coordinate for `.centerMapOnCoordinate` (NotificationCenter needs a reference type).
final class MapCenterPayload: NSObject {
    let lat: Double
    let lng: Double
    init(lat: Double, lng: Double) {
        self.lat = lat
        self.lng = lng
        super.init()
    }
}