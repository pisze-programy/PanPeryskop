import SwiftUI
import AVFoundation
import Photos
import CoreLocation
import UserNotifications

enum PermissionState {
    case authorized
    case denied
    case notDetermined
    case restricted

    var label: String {
        switch self {
        case .authorized: return "Dostęp przyznany"
        case .denied: return "Odmowa"
        case .notDetermined: return "Nie zapytano"
        case .restricted: return "Ograniczone"
        }
    }

    var color: Color {
        switch self {
        case .authorized: return .green
        case .denied: return .red
        case .notDetermined: return .gray
        case .restricted: return .orange
        }
    }
}

struct PermissionCardData {
    let icon: String
    let title: String
    let description: String
    let state: PermissionState
    var detail: String? = nil
}

struct PermissionCardsView: View {
    var showsHeader: Bool = true
    @State private var cards: [PermissionCardData] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if showsHeader {
                Text("Uprawnienia")
                    .font(.headline)
                    .padding(.horizontal)
            }

            VStack(spacing: 10) {
                ForEach(cards, id: \.title) { card in
                    PermissionCard(card: card)
                }
            }
            .padding(.horizontal)
        }
        .onAppear { refresh() }
    }

    private func refresh() {
        let camera = PermissionCardData(
            icon: "camera.fill",
            title: "Aparat",
            description: "Potrzebujemy dostępu do aparatu, aby nagrywać treści.",
            state: cameraState
        )
        let mic = PermissionCardData(
            icon: "mic.fill",
            title: "Mikrofon",
            description: "Potrzebujemy mikrofonu do nagrywania filmów.",
            state: micState
        )
        let library = PermissionCardData(
            icon: "photo.on.rectangle",
            title: "Galeria",
            description: "Potrzebujemy dostępu do galerii, aby wybierać zdjęcia i filmy.",
            state: libraryState
        )
        let location = PermissionCardData(
            icon: "location.fill",
            title: "Lokalizacja",
            description: "Używamy Twojej lokalizacji do przypinania treści.",
            state: locationState,
            detail: locationDetail
        )
        let base: [PermissionCardData] = [camera, mic, library, location]

        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let notifications = PermissionCardData(
                icon: "bell.badge.fill",
                title: "Powiadomienia",
                description: "Powiadomienia o nowych mediach i prośbach o podgląd w okolicy.",
                state: Self.notificationState(settings)
            )
            var all = base
            all.append(notifications)
            let cards = all
            Task { @MainActor in
                self.cards = cards
            }
        }
    }

    nonisolated private static func notificationState(_ settings: UNNotificationSettings) -> PermissionState {
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: return .authorized
        case .denied: return .denied
        case .notDetermined: return .notDetermined
        @unknown default: return .notDetermined
        }
    }

    private var locationDetail: String? {
        switch CLLocationManager.authorizationStatus() {
        case .authorizedAlways: return "Zawsze"
        case .authorizedWhenInUse: return "Tylko podczas używania"
        default: return nil
        }
    }

    private var cameraState: PermissionState {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return .authorized
        case .denied: return .denied
        case .notDetermined: return .notDetermined
        case .restricted: return .restricted
        @unknown default: return .notDetermined
        }
    }

    private var micState: PermissionState {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: return .authorized
        case .denied: return .denied
        case .undetermined: return .notDetermined
        @unknown default: return .notDetermined
        }
    }

    private var libraryState: PermissionState {
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .authorized: return .authorized
        case .limited: return .authorized
        case .denied: return .denied
        case .notDetermined: return .notDetermined
        case .restricted: return .restricted
        @unknown default: return .notDetermined
        }
    }

    private var locationState: PermissionState {
        switch CLLocationManager.authorizationStatus() {
        case .authorizedWhenInUse, .authorizedAlways: return .authorized
        case .denied: return .denied
        case .notDetermined: return .notDetermined
        case .restricted: return .restricted
        @unknown default: return .notDetermined
        }
    }
}

struct PermissionCard: View {
    let card: PermissionCardData

    var body: some View {
        Button {
            openSettings()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: card.icon)
                    .font(.title3)
                    .foregroundColor(card.state.color)
                    .frame(width: 32)

                VStack(alignment: .leading, spacing: 2) {
                    Text(card.title)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.primary)
                    Text(card.description)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.leading)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(card.state.label)
                        .font(.caption)
                        .foregroundColor(card.state.color)
                    if let detail = card.detail {
                        Text(detail)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }

                Image(systemName: "chevron.right")
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
            .padding(12)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}
