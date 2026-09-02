import Foundation
import CoreLocation
import UserNotifications
import UIKit

/// Client-side geofencing for media-request pins + user location tracking for the
/// "new media nearby" banner. Delivers:
///   - media-request ("?") pin: local notification / in-app banner when entering a 20 m region,
///   - new-media-nearby: banner when the app is foregrounded (live, no throttle).
/// Note: region accuracy below iOS's reliable ~100 m is best-effort.
@MainActor
final class ProximityMonitor: NSObject, @preconcurrency CLLocationManagerDelegate {
    static let shared = ProximityMonitor()

    private let locationManager = CLLocationManager()
    private var monitoredRequests: [String: MediaRequest] = [:]
    private var lastNotifiedAt: [String: Date] = [:]
    private var currentUserId: String?
    private var isUpdatingLocation = false

    private static let regionRadius: CLLocationDistance = 20
    private static let maxRegions = 20
    private static let dedupeInterval: TimeInterval = 600
    private static let suppressOwnFreshPin: TimeInterval = 120
    private static let backgroundPushCooldown: TimeInterval = 30 * 60
    private static let backgroundPushKey = "notifications.lastBackgroundPush"

    private override init() {
        super.init()
        locationManager.delegate = self
    }

    /// Refresh monitored regions from the currently active request pins. Cheap: only diffs identifiers.
    func sync(requests: [MediaRequest], currentUserId: String?) {
        self.currentUserId = currentUserId

        let active = requests
            .filter { $0.isStillValid }
            .sorted { $0.created_at > $1.created_at } // most recent first when over the region cap

        let target = Dictionary(uniqueKeysWithValues: active.prefix(Self.maxRegions).map { ($0.id, $0) })
        let targetIds = Set(target.keys)

        // Stop monitoring pins that expired or left the viewport.
        for id in monitoredRequests.keys where !targetIds.contains(id) {
            if let region = monitoredRequests[id] {
                let circular = CLCircularRegion(
                    center: region.coordinate,
                    radius: Self.regionRadius,
                    identifier: id
                )
                locationManager.stopMonitoring(for: circular)
            }
        }

        // Register new pins.
        for (id, request) in target where monitoredRequests[id] == nil {
            let circular = CLCircularRegion(
                center: request.coordinate,
                radius: Self.regionRadius,
                identifier: id
            )
            circular.notifyOnEntry = true
            circular.notifyOnExit = false
            do {
                try locationManager.startMonitoring(for: circular)
            } catch {
                print("ProximityMonitor: failed to monitor \(id):", error)
            }
        }

        monitoredRequests = target
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
    /// app is foregrounded — see `willPresent`). Live, no throttle.
    func deliverNewMedia(post: Post) async {
        let isActive = UIApplication.shared.applicationState == .active
        let isEvents = (post.category ?? "live") == "events"
        let title = isEvents ? "Nowe Wydarzenie w okolicy" : "Nowe Live w okolicy"
        let body = isEvents
            ? "Sprawdź co się dzieje w okolicy, nowe Wydarzenie dodane"
            : "Sprawdź co się dzieje w okolicy, nowe Live dodane"

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
            "category": post.category ?? "live",
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

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard let request = monitoredRequests[region.identifier], request.isStillValid else { return }
        let now = Date()

        // Dedupe: don't re-notify about the same pin shortly after the last trigger.
        if let last = lastNotifiedAt[region.identifier], now.timeIntervalSince(last) < Self.dedupeInterval {
            return
        }
        // Don't notify the owner the instant they drop their own pin (they're already there).
        if let me = currentUserId, request.user_id == me {
            let pinAge = now.timeIntervalSince1970 - TimeInterval(request.created_at) / 1000
            if pinAge < Self.suppressOwnFreshPin { return }
        }

        lastNotifiedAt[region.identifier] = now
        deliver(request: request)
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        NotificationSettings.persistLocation(location)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("ProximityMonitor: monitoring failed:", error)
    }

    // MARK: - Delivery

    private func deliver(request: MediaRequest) {
        let title = "Podgląd okolicy"
        let body = "Ktoś w Twojej okolicy prosi o podgląd na żywo."
        let isActive = UIApplication.shared.applicationState == .active

        if !isActive && !canDeliverBackground() {
            return
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.userInfo = [
            "type": "request",
            "media_request_id": request.id,
            "lat": request.lat,
            "lng": request.lng,
        ]
        let requestID = "media-request-\(request.id)-\(Int(Date().timeIntervalSince1970))"
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
}

extension Notification.Name {
    static let centerMapOnRequest = Notification.Name("centerMapOnRequest")
    static let openPushPost = Notification.Name("openPushPost")
}

/// Payload for `.centerMapOnRequest` — a boxed coordinate (NotificationCenter needs a reference type).
final class MapCenterPayload: NSObject {
    let lat: Double
    let lng: Double
    init(lat: Double, lng: Double) {
        self.lat = lat
        self.lng = lng
        super.init()
    }
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
    private(set) static var pendingCenter: MapCenterPayload?
    private(set) static var pendingPushPost: PushPostPayload?

    static func consumePendingCenter() -> MapCenterPayload? {
        let payload = pendingCenter
        pendingCenter = nil
        return payload
    }

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
                category: info["category"] as? String ?? "live"
            )
            Self.pendingPushPost = payload
            NotificationCenter.default.post(name: .openPushPost, object: payload)
        } else if let lat = info["lat"] as? Double, let lng = info["lng"] as? Double {
            let payload = MapCenterPayload(lat: lat, lng: lng)
            Self.pendingCenter = payload
            NotificationCenter.default.post(name: .centerMapOnRequest, object: payload)
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
