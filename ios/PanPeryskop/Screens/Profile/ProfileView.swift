import SwiftUI
import PhotosUI
import AVFoundation

struct ProfileView: View {
    @EnvironmentObject private var authManager: AuthManager

    @State private var avatarItem: PhotosPickerItem?
    @State private var uploadingAvatar = false
    @State private var showNicknameEditor = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    Spacer().frame(height: 40)

                    avatarSection

                    HStack(spacing: 8) {
                        Text(authManager.displayUsername)
                            .font(.title)
                            .fontWeight(.bold)
                        Button {
                            showNicknameEditor = true
                        } label: {
                            Image(systemName: "pencil")
                                .font(.subheadline)
                                .foregroundColor(.accentColor)
                        }
                    }

                    if let userId = authManager.userId {
                        Text("ID urządzenia: \(userId.prefix(16))...")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    if let provider = authManager.authProvider {
                        Text(providerLabel(provider))
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    menuList

                    Button(role: .destructive) {
                        Task { await authManager.logout() }
                    } label: {
                        Label("Wyloguj się", systemImage: "rectangle.portrait.and.arrow.right")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                    .padding(.horizontal, 32)

                    Spacer().frame(height: 120)
                }
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $showNicknameEditor) {
                NicknameEditView(initial: authManager.username ?? "")
                    .environmentObject(authManager)
            }
        }
    }

    private var avatarSection: some View {
        ZStack(alignment: .bottomTrailing) {
            AvatarView(url: authManager.avatarDisplayURL, size: 100)

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

    private var menuList: some View {
        VStack(spacing: 10) {
            NavigationLink {
                MyContentView()
            } label: {
                ProfileMenuRow(
                    icon: "photo.stack",
                    title: "Moje treści",
                    subtitle: "Twoje posty, statusy i statystyki"
                )
            }

            NavigationLink {
                PermissionsView()
            } label: {
                ProfileMenuRow(
                    icon: "hand.raised.fill",
                    title: "Uprawnienia",
                    subtitle: "Aparat, mikrofon, galeria, lokalizacja"
                )
            }
        }
        .padding(.horizontal)
    }

    private func providerLabel(_ provider: String) -> String {
        switch provider {
        case "apple": return "Zalogowano przez Apple"
        case "google": return "Zalogowano przez Google"
        default: return "Zalogowano przez urządzenie"
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
            authManager.setAvatarUrl(url)
        } catch {
            print("Failed to upload avatar:", error)
        }
    }
}

struct ProfileMenuRow: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(.accentColor)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.footnote)
                .foregroundColor(.secondary)
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
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
                        defaultAvatar
                    }
                }
            } else {
                defaultAvatar
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var defaultAvatar: some View {
        Image("Logo")
            .resizable()
            .aspectRatio(contentMode: .fill)
            .scaleEffect(1.5)
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
