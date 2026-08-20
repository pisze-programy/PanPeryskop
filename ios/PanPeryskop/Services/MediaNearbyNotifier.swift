import Foundation
import CoreLocation

/// User-facing notification preferences for the "new media nearby" push (Profile → Ustawienia).
enum NotificationSettings {
    static let mediaNearbyLiveKey = "notifications.mediaNearbyLive"
    static let mediaNearbyEventsKey = "notifications.mediaNearbyEvents"
    static let mediaNearbyRangeKey = "notifications.mediaNearbyRange"

    /// "100" | "300" | "city"
    static var mediaNearbyRange: String {
        UserDefaults.standard.string(forKey: mediaNearbyRangeKey) ?? "city"
    }

    static var mediaNearbyLiveEnabled: Bool {
        UserDefaults.standard.object(forKey: mediaNearbyLiveKey) as? Bool ?? true
    }

    static var mediaNearbyEventsEnabled: Bool {
        UserDefaults.standard.object(forKey: mediaNearbyEventsKey) as? Bool ?? true
    }

    static var isMediaPushEnabled: Bool {
        mediaNearbyLiveEnabled || mediaNearbyEventsEnabled
    }

    static var needsGps: Bool {
        mediaNearbyRange == "100" || mediaNearbyRange == "300"
    }

    // Last known user location (persisted for background BGTask runs).
    static var lastLocation: CLLocation? {
        guard
            let lat = UserDefaults.standard.object(forKey: "notifications.last_lat") as? Double,
            let lng = UserDefaults.standard.object(forKey: "notifications.last_lng") as? Double
        else { return nil }
        return CLLocation(latitude: lat, longitude: lng)
    }

    static func persistLocation(_ location: CLLocation) {
        UserDefaults.standard.set(location.coordinate.latitude, forKey: "notifications.last_lat")
        UserDefaults.standard.set(location.coordinate.longitude, forKey: "notifications.last_lng")
    }
}

/// City-wide detection of "new media nearby". Shared by the foreground 20 s polling (live,
/// no throttle) and the background BGAppRefreshTask (~1 h, throttled to 1 push / 30 min).
/// Detects both categories (Live + Wydarzenia) regardless of the currently selected map category;
/// the target post is the one closest to the reference point (city center for "Miasto", user
/// location for the GPS ranges).
@MainActor
final class MediaNearbyNotifier {
    static let shared = MediaNearbyNotifier()

    private enum Store {
        static let seenKey = "mediaPush.seen_post_ids"
        static let currentUserIdKey = "mediaPush.current_user_id"
    }

    private var seenIds: Set<String>
    private var isChecking = false

    private init() {
        let stored = UserDefaults.standard.stringArray(forKey: Store.seenKey) ?? []
        seenIds = Set(stored)
    }

    static func persistCurrentUserId(_ id: String?) {
        if let id {
            UserDefaults.standard.set(id, forKey: Store.currentUserIdKey)
        } else {
            UserDefaults.standard.removeObject(forKey: Store.currentUserIdKey)
        }
    }

    private static var currentUserId: String? {
        UserDefaults.standard.string(forKey: Store.currentUserIdKey)
    }

    private static var selectedCity: City {
        let id = UserDefaults.standard.string(forKey: "map.last_city_id")
        return City.all.first { $0.id == id } ?? City.all[0]
    }

    private func persistSeen() {
        UserDefaults.standard.set(Array(seenIds), forKey: Store.seenKey)
    }

    /// Foreground live check — never throttled.
    @discardableResult
    func pollForeground(city: City) async -> Bool {
        guard NotificationSettings.isMediaPushEnabled else { return false }
        guard !isChecking else { return false }
        isChecking = true
        defer { isChecking = false }
        return await check(city: city, fromBackground: false)
    }

    /// Background BGTask check — delivery is throttled to once per 30 min.
    func pollBackground() async {
        guard NotificationSettings.isMediaPushEnabled else { return }
        guard !isChecking else { return }
        isChecking = true
        defer { isChecking = false }
        _ = await check(city: Self.selectedCity, fromBackground: true)
    }

    /// Fetch city-wide stories (both categories), filter by settings + range, pick the most
    /// relevant new post and deliver the push. Returns whether a push was delivered.
    private func check(city: City, fromBackground: Bool) async -> Bool {
        let region = city.region
        let params = [
            "sw_lat": String(region.center.latitude - region.span.latitudeDelta / 2),
            "sw_lng": String(region.center.longitude - region.span.longitudeDelta / 2),
            "ne_lat": String(region.center.latitude + region.span.latitudeDelta / 2),
            "ne_lng": String(region.center.longitude + region.span.longitudeDelta / 2),
        ]
        let resp: PostListResponse
        do {
            resp = try await APIClient.get("/stories", params: params)
        } catch {
            print("MediaNearby: fetch failed:", error)
            return false
        }

        let liveOn = NotificationSettings.mediaNearbyLiveEnabled
        let eventsOn = NotificationSettings.mediaNearbyEventsEnabled
        let me = Self.currentUserId
        let range = NotificationSettings.mediaNearbyRange

        // First-ever run: just record the current city content so only genuinely NEW media
        // triggers a push afterwards (no backfill of pre-existing posts).
        if seenIds.isEmpty {
            resp.stories.forEach { seenIds.insert($0.id) }
            persistSeen()
            return false
        }

        let newPosts = resp.stories.filter { post in
            guard !seenIds.contains(post.id) else { return false }
            guard me == nil || post.user_id != me else { return false }
            let cat = post.category ?? "live"
            if cat == "live" {
                guard liveOn else { return false }
            } else {
                guard eventsOn else { return false }
            }
            switch range {
            case "100":
                guard let loc = NotificationSettings.lastLocation else { return false }
                guard CLLocation(latitude: post.lat, longitude: post.lng).distance(from: loc) <= 100 else { return false }
            case "300":
                guard let loc = NotificationSettings.lastLocation else { return false }
                guard CLLocation(latitude: post.lat, longitude: post.lng).distance(from: loc) <= 300 else { return false }
            default:
                break
            }
            return true
        }

        // Always advance the seen set, so a post is pushed at most once.
        resp.stories.forEach { seenIds.insert($0.id) }
        persistSeen()

        guard let target = closestToReference(newPosts, city: city) else { return false }
        await ProximityMonitor.shared.deliverNewMedia(post: target)
        return true
    }

    private func closestToReference(_ posts: [Post], city: City) -> Post? {
        guard !posts.isEmpty else { return nil }
        let reference: CLLocation
        switch NotificationSettings.mediaNearbyRange {
        case "100", "300":
            reference = NotificationSettings.lastLocation
                ?? CLLocation(latitude: city.lat, longitude: city.lng)
        default:
            reference = CLLocation(latitude: city.lat, longitude: city.lng)
        }
        return posts.min { lhs, rhs in
            let l = CLLocation(latitude: lhs.lat, longitude: lhs.lng).distance(from: reference)
            let r = CLLocation(latitude: rhs.lat, longitude: rhs.lng).distance(from: reference)
            return l < r
        }
    }
}
