import SwiftUI
import CoreLocation

struct DescriptionStepView: View {
    let mediaType: Post.MediaType
    let mediaData: Data
    let fromCamera: Bool

    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    @State private var description = ""
    @State private var isLoading = false
    @State private var statusMessage: String?
    @StateObject private var locationManager = LocationManager()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    mediaPreview
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .padding(.horizontal)

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Opis")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        TextField("Co się dzieje?", text: $description, axis: .vertical)
                            .lineLimit(3...5)
                            .textFieldStyle(.roundedBorder)
                    }
                    .padding(.horizontal)

                    if locationManager.authorizationStatus == .denied || locationManager.authorizationStatus == .restricted {
                        Button {
                            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                            UIApplication.shared.open(url)
                        } label: {
                            HStack {
                                Image(systemName: "exclamationmark.triangle.fill")
                                Text("Lokalizacja niedostępna — otwórz Ustawienia")
                            }
                            .font(.caption)
                            .foregroundColor(.orange)
                            .padding()
                            .frame(maxWidth: .infinity)
                            .background(Color.orange.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .padding(.horizontal)
                    }

                    if let msg = statusMessage {
                        Text(msg)
                            .font(.caption)
                            .foregroundColor(msg.contains("Błąd") ? .red : .green)
                            .padding(.horizontal)
                    }

                    Button(action: { Task { await publish() } }) {
                        HStack {
                            if isLoading {
                                ProgressView().tint(.white)
                            }
                            Text("Opublikuj")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color.accentColor)
                        .foregroundColor(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    .disabled(isLoading)
                    .padding(.horizontal, 32)
                }
                .padding(.vertical, 20)
            }
            .navigationTitle("Nowa treść")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
            }
        }
    }

    @ViewBuilder
    private var mediaPreview: some View {
        if mediaType == .photo, let image = UIImage(data: mediaData) {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(maxHeight: 300)
        } else if mediaType == .video {
            ZStack {
                if let image = UIImage(data: mediaData.prefix(10000)) {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                }
                Rectangle()
                    .fill(Color.black.opacity(0.3))
                    .frame(maxHeight: 300)
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 48))
                    .foregroundColor(.white)
            }
        }
    }

    private func publish() async {
        isLoading = true
        statusMessage = nil

        let lat = locationManager.currentLocation?.coordinate.latitude ?? 52.4064
        let lng = locationManager.currentLocation?.coordinate.longitude ?? 16.9252

        do {
            let mimeType = mediaType == .video ? "video/mp4" : "image/jpeg"
            let ext = mediaType == .video ? "mp4" : "jpg"
            let resp = try await APIClient.uploadMedia(
                "/posts", fileData: mediaData, fileName: "capture.\(ext)", mimeType: mimeType,
                fields: ["type": mediaType.rawValue, "lat": String(lat), "lng": String(lng), "description": description]
            )
            PendingStore.shared.save(Post(
                id: resp.id, user_id: authManager.userId ?? "local",
                type: mediaType,
                lat: lat, lng: lng, description: description,
                media_key: resp.media_key, thumb_key: nil,
                created_at: resp.created_at, expires_at: resp.expires_at,
                likes_count: 0, views_count: 0, shares_count: 0,
                grid_cell_id: nil,
                liked: false, watched: false, author_name: "Ty",
                media_url: nil, thumb_url: nil, author_avatar_url: nil
            ))
            await MainActor.run {
                ToastManager.shared.show("Zapisano!")
                dismiss()
            }
        } catch {
            statusMessage = "Błąd: \(error.localizedDescription)"
        }

        isLoading = false
    }
}

class LocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    @Published var currentLocation: CLLocation?
    @Published var authorizationStatus: CLAuthorizationStatus = .notDetermined

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.requestWhenInUseAuthorization()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorizationStatus = manager.authorizationStatus
        if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways {
            manager.startUpdatingLocation()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        currentLocation = locations.last
    }
}
