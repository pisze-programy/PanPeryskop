import Foundation
import CoreLocation
import UserNotifications
import UIKit

/// User location tracking for the "new media nearby" banner. Delivers the
/// new-media-nearby notification when the app is foregrounded.
@MainActor
final class ProximityMonitor: NSObject, @preconcurrency CLLocationManagerDelegate {
    static let shared = ProximityMonitor()

    private let locationManager = CLLocationManager()
    private var isUpdatingLocation = false

    private static let backgroundPushCooldown: TimeInterval = 30 * 60
    private static let backgroundPushKey = "notifications.lastBackgroundPush"

    private override init() {
        super.init()
        locationManager.delegate = self
    }

    /// Starts/stops GPS tracking based on the notification range setting (needed only for 100/300 m).
    func updateLocationTrackingIfNeeded() {
        let shouldTrack = NotificationSettings.isMediaPushEnabled && NotificationSettings.needsGps
        if shouldTrack, !isUpdatingLocation {
            isUpdatingLocation = true
            locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
            locationManager.distanceFilter = 50
            locationManager.pausesLocationUpdatesAutomatically = true
            locationManager.activityType = .other
            locationManager.startUpdatingLocation()
        } else if !shouldTrack, isUpdatingLocation {
            isUpdatingLocation = false
            locationManager.stopUpdatingLocation()
        }
    }

    /// Ask only for notification permission (needed by the "new media nearby" push).
    /// Location is "WhenInUse" only and requested at media-add time; no Always prompt.
    func requestNotificationPermissionIfNeeded() {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            if settings.authorizationStatus == .notDetermined {
                center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
            }
        }
    }

    // MARK: - "New media nearby" push

    /// Delivers the "new media nearby" push as a real system notification (banner also while the
    /// app is foregrounded — see `willPresent`). Live category only. No throttle.
    func deliverNewMedia(post: Post) async {
        let isActive = UIApplication.shared.applicationState == .active
        let title = "Nowe Live w okolicy"
        let body = "Sprawdź co się dzieje w okolicy, nowe Live dodane"

        if !isActive && !canDeliverBackground() {
            return
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.userInfo = [
            "type": "media",
            "post_id": post.id,
            "category": post.category ?? AppConstants.categoryLive,
            "lat": post.lat,
            "lng": post.lng,
        ]
        let requestID = "media-\(post.id)-\(Int(Date().timeIntervalSince1970))"
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: requestID, content: content, trigger: nil)
        ) { error in
            if let error {
                print("ProximityMonitor: notification failed:", error)
            }
        }

        if !isActive {
            markBackgroundDelivered()
        }
    }

    private func canDeliverBackground() -> Bool {
        let last = UserDefaults.standard.object(forKey: Self.backgroundPushKey) as? Double ?? 0
        return Date().timeIntervalSince1970 - last >= Self.backgroundPushCooldown
    }

    private func markBackgroundDelivered() {
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: Self.backgroundPushKey)
    }

    // MARK: - CLLocationManagerDelegate

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        NotificationSettings.persistLocation(location)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("ProximityMonitor: monitoring failed:", error)
    }
}

extension Notification.Name {
    static let openPushPost = Notification.Name("openPushPost")
}

/// Payload for `.openPushPost` — a media push tap: open the story for this post after switching
/// the map to the correct category (Live / Wydarzenia).
final class PushPostPayload: NSObject {
    let postId: String
    let category: String
    init(postId: String, category: String) {
        self.postId = postId
        self.category = category
        super.init()
    }
}

/// Routes notification taps to the map/story viewer and keeps pending payloads for the case
/// where the app launches from a notification before the map view exists.
@MainActor
final class NotificationDelegate: NSObject, @preconcurrency UNUserNotificationCenterDelegate {
    static let shared = NotificationDelegate()
    private(set) static var pendingPushPost: PushPostPayload?

    static func consumePendingPushPost() -> PushPostPayload? {
        let payload = pendingPushPost
        pendingPushPost = nil
        return payload
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let info = response.notification.request.content.userInfo
        if info["type"] as? String == "media", let postId = info["post_id"] as? String {
            let payload = PushPostPayload(
                postId: postId,
                category: info["category"] as? String ?? AppConstants.categoryLive
            )
            Self.pendingPushPost = payload
            NotificationCenter.default.post(name: .openPushPost, object: payload)
        }
        completionHandler()
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .list])
    }
}
