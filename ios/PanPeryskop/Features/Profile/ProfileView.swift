import SwiftUI
import PhotosUI

@MainActor
struct ProfileView: View {
    @EnvironmentObject private var authManager: AuthManager
    var onBack: (() -> Void)? = nil

    @State private var avatarItem: PhotosPickerItem?
    @State private var uploadingAvatar = false
    @State private var showNicknameEditor = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.xl) {
                    backHeader
                    avatarSection
                    usernameRow
                    deviceIdLabel
                    providerLabelView
                    menuList
                    Spacer().frame(height: 140)
                }
                .padding(.top, onBack == nil ? Theme.Spacing.xl : 0)
            }
            .scrollContentBackground(.hidden)
            .background(Color(.systemGroupedBackground).ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showNicknameEditor) {
                NicknameEditView(initial: authManager.username ?? "")
                    .environmentObject(authManager)
            }
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
    }

    @ViewBuilder
    private var backHeader: some View {
        if let onBack {
            HStack {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(.primary)
                        .frame(width: 36, height: 36)
                        .background(.ultraThinMaterial)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                Spacer()
            }
            .padding(.horizontal)
            .padding(.top, Theme.Spacing.m)
        }
    }

    private var usernameRow: some View {
        HStack(spacing: Theme.Spacing.s) {
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
    }

    @ViewBuilder
    private var deviceIdLabel: some View {
        if let userId = authManager.userId {
            Text("ID urządzenia: \(userId.prefix(16))...")
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    @ViewBuilder
    private var providerLabelView: some View {
        if let provider = authManager.authProvider {
            Text(providerLabel(provider))
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    private var avatarSection: some View {
        let isUploading = uploadingAvatar
        return ZStack(alignment: .bottomTrailing) {
            AvatarView(url: authManager.avatarDisplayURL, size: 100)

            PhotosPicker(selection: $avatarItem, matching: .images) {
                AvatarUploadBadge(isUploading: isUploading)
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
                SettingsView()
                    .toolbar(.visible, for: .navigationBar)
            } label: {
                ProfileMenuRow(
                    icon: "gearshape.fill",
                    title: "Ustawienia"
                )
            }

            Spacer().frame(height: Theme.Spacing.m)

            Button {
                Task { await authManager.logout() }
            } label: {
                ProfileMenuRow(
                    icon: "rectangle.portrait.and.arrow.right",
                    title: "Wyloguj się",
                    showsChevron: false
                )
            }
            .buttonStyle(.plain)
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
            guard let image = UIImage(data: data) else { return }
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
    var subtitle: String? = nil
    var showsChevron: Bool = true

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(.accentColor)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
                subtitleView
            }

            Spacer()

            chevronView
        }
        .padding(Theme.Spacing.m)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card))
    }

    @ViewBuilder
    private var subtitleView: some View {
        if let subtitle {
            Text(subtitle)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    @ViewBuilder
    private var chevronView: some View {
        if showsChevron {
            Image(systemName: "chevron.right")
                .font(.footnote)
                .foregroundColor(.secondary)
        }
    }
}

struct AvatarView: View {
    let url: String?
    var size: CGFloat = 100

    private var avatarURL: URL? {
        url.flatMap(URL.init(string:))
    }

    var body: some View {
        ZStack {
            defaultAvatar
            remoteAvatar
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    @ViewBuilder
    private var remoteAvatar: some View {
        if let avatarURL {
            RemoteImage(url: avatarURL)
        }
    }

    private var defaultAvatar: some View {
        ZStack {
            Color.black
            Image("Logo")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .scaleEffect(0.85)
        }
    }
}

private struct AvatarUploadBadge: View {
    let isUploading: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.accentColor)
                .frame(width: 30, height: 30)
            icon
        }
    }

    @ViewBuilder
    private var icon: some View {
        if isUploading {
            ProgressView().tint(.white).scaleEffect(0.7)
        } else {
            Image(systemName: "pencil")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.white)
        }
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
