import SwiftUI
import PhotosUI
import AVFoundation
import Photos

struct AddContentView: View {
    @EnvironmentObject private var authManager: AuthManager
    @State private var mediaType = MediaType.photo
    @State private var description = ""
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var photoData: Data?
    @State private var isShowingCamera = false
    @State private var isRecording = false
    @State private var isLoading = false
    @State private var statusMessage: String?
    @State private var navigateBack = false

    @StateObject private var locationManager = LocationManager()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    Picker("Typ treści", selection: $mediaType) {
                        Text("Zdjęcie").tag(MediaType.photo)
                        Text("Wideo").tag(MediaType.video)
                        Text("Tekst").tag(MediaType.text)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)

                    if mediaType != .text {
                        if let data = photoData, let uiImage = UIImage(data: data) {
                            Image(uiImage: uiImage)
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(height: 300)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        } else {
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color.secondary.opacity(0.2))
                                .frame(height: 300)
                                .overlay {
                                    VStack(spacing: 12) {
                                        Image(systemName: mediaType == .video ? "video.fill" : "camera.fill")
                                            .font(.system(size: 40))
                                            .foregroundColor(.secondary)
                                        Text("Wybierz z galerii lub zrób zdjęcie")
                                            .font(.subheadline)
                                            .foregroundColor(.secondary)
                                    }
                                }
                        }

                        HStack(spacing: 20) {
                            PhotosPicker(selection: $selectedPhoto, matching: mediaType == .video ? .videos : .images) {
                                Label("Galeria", systemImage: "photo.on.rectangle")
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 12)
                                    .background(Color.accentColor.opacity(0.1))
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                            .onChange(of: selectedPhoto) { _, newItem in
                                loadPhoto(from: newItem)
                            }

                            Button {
                                isShowingCamera = true
                            } label: {
                                Label("Aparat", systemImage: "camera.fill")
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 12)
                                    .background(Color.accentColor.opacity(0.1))
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                        }
                        .padding(.horizontal)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Opis")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        TextField("Co się dzieje?", text: $description, axis: .vertical)
                            .lineLimit(3...5)
                            .textFieldStyle(.roundedBorder)
                    }
                    .padding(.horizontal)

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Lokalizacja")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        HStack {
                            Image(systemName: "location.fill")
                                .foregroundColor(.accentColor)
                            if let loc = locationManager.currentLocation {
                                Text(String(format: "%.4f, %.4f", loc.coordinate.latitude, loc.coordinate.longitude))
                                    .font(.caption)
                                    .foregroundColor(.primary)
                            } else {
                                Text("Pobieranie...")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                    .padding(.horizontal)

                    if let msg = statusMessage {
                        Text(msg)
                            .font(.caption)
                            .foregroundColor(msg.contains("Błąd") ? .red : .green)
                            .padding(.horizontal)
                    }

                    Button(action: { Task { await submitPost() } }) {
                        HStack {
                            if isLoading {
                                ProgressView().tint(.white)
                            }
                            Text("Opublikuj")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(canSubmit ? Color.accentColor : Color.gray)
                        .foregroundColor(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    .disabled(!canSubmit || isLoading)
                    .padding(.horizontal, 32)
                }
                .padding(.vertical, 20)
            }
            .navigationTitle("Dodaj treść")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { navigateBack = true }
                }
            }
            .fullScreenCover(isPresented: $isShowingCamera) {
                CameraCaptureView { data, type in
                    photoData = data
                    mediaType = type == .movie ? .video : .photo
                    isShowingCamera = false
                }
            }
        }
    }

    private var canSubmit: Bool {
        if mediaType == .text { return !description.trimmingCharacters(in: .whitespaces).isEmpty }
        return photoData != nil
    }

    private func loadPhoto(from item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            if let data = try? await item.loadTransferable(type: Data.self) {
                await MainActor.run { photoData = data }
            }
        }
    }

    private func submitPost() async {
        isLoading = true
        statusMessage = nil

        let lat = locationManager.currentLocation?.coordinate.latitude ?? 52.4064
        let lng = locationManager.currentLocation?.coordinate.longitude ?? 16.9252

        do {
            if mediaType == .text {
                let _: CreatePostResponse = try await APIClient.post("/posts", body: TextPostRequest(
                    type: "text", lat: lat, lng: lng, description: description
                ))
            } else if let data = photoData {
                let mimeType = mediaType == .video ? "video/mp4" : "image/jpeg"
                let ext = mediaType == .video ? "mp4" : "jpg"
                let _ = try await APIClient.uploadMedia(
                    "/posts",
                    fileData: data,
                    fileName: "capture.\(ext)",
                    mimeType: mimeType,
                    fields: [
                        "type": mediaType.rawValue,
                        "lat": String(lat),
                        "lng": String(lng),
                        "description": description,
                    ]
                )
            }

            statusMessage = "Wysłano! Treść oczekuje na weryfikację."
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            // navigate back
            description = ""
            photoData = nil
            selectedPhoto = nil
        } catch {
            statusMessage = "Błąd wysyłania: \(error.localizedDescription)"
        }

        isLoading = false
    }
}

enum MediaType: String, Codable {
    case photo, video, text
}

class LocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    @Published var currentLocation: CLLocation?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        currentLocation = locations.last
    }
}

