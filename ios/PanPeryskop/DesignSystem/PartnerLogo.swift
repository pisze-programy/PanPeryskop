import SwiftUI

struct PartnerLogo: View {
    let name: String
    var size: CGFloat = 40

    @State private var loadedImage: UIImage?
    @State private var loadedName: String?

    private var url: URL? {
        URL(string: "\(APIClient.baseURL)/media/partners/\(name).png")
    }

    private var displayedImage: Image? {
        if let remote = shownRemote { return Image(uiImage: remote) }
        return UIImage(named: name).map(Image.init)
    }

    private var shownRemote: UIImage? {
        if loadedName == name, let loadedImage { return loadedImage }
        guard let url else { return nil }
        return RemoteImageStore.shared.cached(url)
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(Color.white)
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5)
            mark
        }
        .frame(width: size, height: size)
        .task(id: name) { await loadLogo() }
    }

    @ViewBuilder
    private var mark: some View {
        if let image = displayedImage {
            image
                .resizable()
                .scaledToFit()
                .padding(5)
        } else {
            Text(String(name.prefix(1)).uppercased())
                .font(.system(size: size * 0.4, weight: .bold))
                .foregroundColor(Color.black.opacity(0.7))
        }
    }

    private func loadLogo() async {
        guard let url else {
            apply(nil, for: name)
            return
        }
        if let hit = RemoteImageStore.shared.cached(url) {
            apply(hit, for: name)
            return
        }
        apply(nil, for: nil)
        let image = await RemoteImageStore.shared.load(url)
        guard !Task.isCancelled else { return }
        apply(image, for: name)
    }

    private func apply(_ image: UIImage?, for targetName: String?) {
        loadedName = targetName
        loadedImage = image
    }
}
