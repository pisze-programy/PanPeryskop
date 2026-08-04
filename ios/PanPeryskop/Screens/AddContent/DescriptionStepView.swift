import SwiftUI
import CoreLocation
import MapKit
import AVKit

struct DescriptionStepView: View {
    let mediaType: Post.MediaType
    let mediaData: Data
    let fromCamera: Bool
    var videoURL: URL?

    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    @State private var description = ""
    @State private var isLoading = false
    @State private var statusMessage: String?
    @State private var compressedVideoData: Data?
    @State private var compressionTask: Task<Void, Never>?
    @State private var isPreviewPlaying = false
    @State private var previewPlayer: AVPlayer?
    @StateObject private var locationManager = LocationManager()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    mediaPreview
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .padding(.horizontal)

                    captureMap
                        .frame(height: 120)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
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
        .onAppear { startCompressionIfNeeded() }
        .onDisappear {
            compressionTask?.cancel()
            previewPlayer?.pause()
        }
    }

    private func startCompressionIfNeeded() {
        guard mediaType == .video, let url = videoURL, compressionTask == nil else { return }
        compressionTask = Task { await compressVideo(from: url) }
    }

    private func compressVideo(from url: URL) async {
        do {
            let outputURL = try await MediaCompressor.compressVideo(from: url)
            let data = try Data(contentsOf: outputURL)
            try? FileManager.default.removeItem(at: outputURL)
            compressedVideoData = data
        } catch {
            print("Video compression failed:", error)
        }
    }

    private func dataForUpload() async throws -> Data {
        if mediaType == .photo { return mediaData }
        if let task = compressionTask { await task.value }
        if let data = compressedVideoData { return data }
        guard let url = videoURL else {
            throw NSError(
                domain: "PanPeryskop",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Brak pliku wideo"]
            )
        }
        return try Data(contentsOf: url)
    }

    @ViewBuilder
    private var mediaPreview: some View {
        Group {
            if mediaType == .video, isPreviewPlaying, let url = videoURL {
                VideoPlayer(player: previewPlayer)
                    .onAppear { startPreviewPlayer(url: url) }
            } else if let image = UIImage(data: mediaData) {
                ZStack {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                    if mediaType == .video {
                        Color.black.opacity(0.25)
                        Button {
                            withAnimation { isPreviewPlaying = true }
                        } label: {
                            Image(systemName: "play.circle.fill")
                                .font(.system(size: 56))
                                .foregroundColor(.white)
                                .shadow(radius: 4)
                        }
                    }
                }
            } else {
                Color.secondary.opacity(0.2)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 200)
        .clipped()
    }

    private var captureCoordinate: CLLocationCoordinate2D {
        locationManager.currentLocation?.coordinate
            ?? CLLocationCoordinate2D(latitude: 52.4064, longitude: 16.9252)
    }

    private var captureMap: some View {
        Map(position: .constant(.region(MKCoordinateRegion(
            center: captureCoordinate,
            span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
        )))) {
            Annotation(coordinate: captureCoordinate, anchor: .center) {
                CaptureLocationPin(image: UIImage(data: mediaData))
            } label: { EmptyView() }
        }
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        .allowsHitTesting(false)
    }

    private func startPreviewPlayer(url: URL) {
        previewPlayer?.pause()
        let player = AVPlayer(url: url)
        previewPlayer = player
        player.play()
    }

    private func publish() async {
        isLoading = true
        statusMessage = nil

        let lat = locationManager.currentLocation?.coordinate.latitude ?? 52.4064
        let lng = locationManager.currentLocation?.coordinate.longitude ?? 16.9252

        do {
            let data = try await dataForUpload()
            let mimeType = mediaType == .video ? "video/mp4" : "image/jpeg"
            let ext = mediaType == .video ? "mp4" : "jpg"
            let resp = try await APIClient.uploadMedia(
                "/posts", fileData: data, fileName: "capture.\(ext)", mimeType: mimeType,
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

struct CaptureLocationPin: View {
    let image: UIImage?

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.white)
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .clipShape(Circle())
            } else {
                Image(systemName: "photo.fill")
                    .font(.system(size: 16))
                    .foregroundColor(.black.opacity(0.6))
            }
        }
        .frame(width: 36, height: 36)
        .overlay(Circle().stroke(Color.white, lineWidth: 2))
        .shadow(color: .black.opacity(0.3), radius: 4, x: 0, y: 2)
    }
}
