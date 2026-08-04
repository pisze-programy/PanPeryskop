import SwiftUI
import PhotosUI
import AVFoundation

struct ProfileView: View {
    @EnvironmentObject private var authManager: AuthManager

    @State private var avatarItem: PhotosPickerItem?
    @State private var uploadingAvatar = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Spacer().frame(height: 40)

                avatarSection

                Text("Pan Peryskop")
                    .font(.title)
                    .fontWeight(.bold)

                if let userId = authManager.userId {
                    Text("ID urządzenia: \(userId.prefix(16))...")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                PermissionCardsView()

                Button(role: .destructive) {
                    authManager.logout()
                } label: {
                    Label("Wyloguj się", systemImage: "rectangle.portrait.and.arrow.right")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .padding(.horizontal, 32)

                Spacer().frame(height: 120)
            }
        }
    }

    private var avatarSection: some View {
        ZStack(alignment: .bottomTrailing) {
            AvatarView(url: authManager.avatarUrl, size: 100)

            PhotosPicker(selection: $avatarItem, matching: .images) {
                ZStack {
                    Circle()
                        .fill(Color.accentColor)
                        .frame(width: 30, height: 30)
                    if uploadingAvatar {
                        ProgressView().tint(.white).scaleEffect(0.7)
                    } else {
                        Image(systemName: "pencil")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.white)
                    }
                }
            }
            .offset(x: 4, y: 4)
        }
        .onChange(of: avatarItem) { _, newItem in
            guard let newItem else { return }
            Task { await uploadAvatar(from: newItem) }
        }
    }

    @MainActor
    private func uploadAvatar(from item: PhotosPickerItem) async {
        uploadingAvatar = true
        defer { uploadingAvatar = false }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else { return }
            let image = UIImage(data: data)
            guard let image else { return }
            let resized = image.resized(to: 128)
            guard let jpeg = resized.jpegData(compressionQuality: 0.7) else { return }
            let url = try await APIClient.uploadAvatar(jpeg)
            authManager.avatarUrl = url
        } catch {
            print("Failed to upload avatar:", error)
        }
    }
}

struct AvatarView: View {
    let url: String?
    var size: CGFloat = 100

    var body: some View {
        Group {
            if let url, let avatarURL = URL(string: url) {
                AsyncImage(url: avatarURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().aspectRatio(contentMode: .fill)
                    default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var placeholder: some View {
        Image(systemName: "person.circle.fill")
            .resizable()
            .scaledToFill()
            .foregroundColor(.accentColor)
    }
}

extension UIImage {
    func resized(to maxDim: CGFloat) -> UIImage {
        let pixelSize = CGSize(width: size.width * scale, height: size.height * scale)
        let s = min(maxDim / pixelSize.width, maxDim / pixelSize.height, 1)
        guard s < 1 else { return self }
        let target = CGSize(width: pixelSize.width * s, height: pixelSize.height * s)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: target, format: format)
        return renderer.image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
    }
}
