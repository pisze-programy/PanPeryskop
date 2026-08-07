import SwiftUI
import CoreLocation
import MapKit
import AVKit

struct DescriptionStepView: View {
    let mediaType: Post.MediaType
    let mediaData: Data
    let fromCamera: Bool
    var videoURL: URL?

    @Environment(\.dismiss) private var dismiss

    @State private var didPublish = false
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

                    if !hasLocation {
                        Text("Udostępnij dostęp do lokalizacji przed publikacją")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }

                    Button(action: {
                        Haptics.impact(.medium)
                        publish()
                    }) {
                        Text("Opublikuj")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(Color.accentColor)
                            .foregroundColor(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    .disabled(!hasLocation)
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
        .onDisappear {
            previewPlayer?.pause()
        }
    }

    private var hasLocation: Bool {
        locationManager.currentLocation != nil
    }

    private func publish() {
        guard !didPublish, let location = locationManager.currentLocation else { return }
        didPublish = true

        let lat = location.coordinate.latitude
        let lng = location.coordinate.longitude

        if mediaType == .photo {
            PendingPostsStore.shared.enqueue(photoData: mediaData, lat: lat, lng: lng, description: "")
        } else if let url = videoURL {
            PendingPostsStore.shared.enqueue(videoURL: url, thumbData: mediaData, lat: lat, lng: lng, description: "")
        }

        Haptics.success()
        PostUploader.shared.start()
        ToastManager.shared.show("Publikuję!")
        dismiss()
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
