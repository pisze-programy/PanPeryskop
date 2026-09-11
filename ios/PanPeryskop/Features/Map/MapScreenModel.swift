import SwiftUI
import MapKit

/// Presentation + request-drop state for the map screen (the media-request pin flow).
@Observable
@MainActor
final class MapScreenModel {
    var previewRequestPin: CLLocationCoordinate2D?
    var pendingRequestDrop: CLLocationCoordinate2D?
    var showConfirmAlert = false
    var showCooldownAlert = false
    var cooldownMinutes = 0

    var cooldownMessage: String {
        cooldownMinutes == 1
            ? "Dodałeś już pin zapytania. Możesz dodać kolejny za 1 minutę."
            : "Dodałeś już pin zapytania. Możesz dodać kolejny za \(cooldownMinutes) min."
    }

    /// User dropped a request pin: show the preview and route to confirm or cooldown.
    func requestDrop(at coordinate: CLLocationCoordinate2D, isLive: Bool, spotsEmpty: Bool, cooldownSeconds: Int) {
        guard isLive, spotsEmpty else { return }
        Haptics.explosion()
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            previewRequestPin = coordinate
        }
        if cooldownSeconds > 0 {
            cooldownMinutes = max(1, Int(ceil(Double(cooldownSeconds) / 60)))
            showCooldownAlert = true
        } else {
            pendingRequestDrop = coordinate
            showConfirmAlert = true
        }
    }

    func confirm(submit: @escaping (CLLocationCoordinate2D) async -> RequestDropResult) {
        guard let coordinate = pendingRequestDrop else {
            clear()
            return
        }
        pendingRequestDrop = nil
        ProximityMonitor.shared.requestNotificationPermissionIfNeeded()
        Task {
            let result = await submit(coordinate)
            switch result {
            case .success:
                Haptics.success()
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { previewRequestPin = nil }
            case .cooldown(let minutes):
                Haptics.error()
                cooldownMinutes = max(1, minutes)
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { previewRequestPin = nil }
                showCooldownAlert = true
            case .failure:
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { previewRequestPin = nil }
                ToastManager.shared.show("Coś poszło nie tak. Spróbuj ponownie.")
            }
        }
    }

    func clear() {
        pendingRequestDrop = nil
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            previewRequestPin = nil
        }
    }

    /// True when no post/request is already within the drop radius.
    func spotsEmpty(at coordinate: CLLocationCoordinate2D, posts: [Post], requests: [MediaRequest]) -> Bool {
        func near(_ lat: Double, _ lng: Double) -> Bool {
            let dlat = lat - coordinate.latitude
            let dlng = lng - coordinate.longitude
            return sqrt(dlat * dlat + dlng * dlng) < 0.0008
        }
        return !posts.contains { near($0.lat, $0.lng) } && !requests.contains { near($0.lat, $0.lng) }
    }
}