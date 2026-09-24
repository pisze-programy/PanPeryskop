import SwiftUI
import UIKit

struct StoryPhoto: View {
    let thumbURL: URL?
    let largeURL: URL
    let onLoaded: () -> Void

    @State private var thumb: UIImage?
    @State private var large: UIImage?
    @State private var failed = false

    private var hasDistinctThumb: Bool { thumbURL != nil && thumbURL != largeURL }

    private var shownThumb: UIImage? {
        if let thumb { return thumb }
        guard hasDistinctThumb, let thumbURL else { return nil }
        return RemoteImageStore.shared.cached(thumbURL)
    }

    private var shownLarge: UIImage? {
        if let large { return large }
        return RemoteImageStore.shared.cached(largeURL)
    }

    var body: some View {
        ZStack(alignment: .center) {
            if let thumb = shownThumb {
                photoLayout(Image(uiImage: thumb)).blur(radius: 3)
            }
            if let large = shownLarge {
                photoLayout(Image(uiImage: large))
            }
            if failed {
                failedView
            }
        }
        .clipped()
        .task(id: largeURL) { await load() }
    }

    private func load() async {
        if hasDistinctThumb, let thumbURL, RemoteImageStore.shared.cached(thumbURL) == nil,
           let loaded = await RemoteImageStore.shared.load(thumbURL) {
            thumb = loaded
            onLoaded()
        }
        guard !Task.isCancelled else { return }
        if let hit = RemoteImageStore.shared.cached(largeURL) {
            large = hit
            onLoaded()
            return
        }
        if let loaded = await RemoteImageStore.shared.load(largeURL) {
            large = loaded
            onLoaded()
        } else if shownThumb == nil {
            failed = true
        } else {
            onLoaded()
        }
    }

    private func photoLayout(_ image: Image) -> some View {
        let frameHeight = UIScreen.main.bounds.height * 0.7
        let frameWidth = frameHeight * 9 / 16
        return ZStack(alignment: .center) {
            image
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: UIScreen.main.bounds.width, height: UIScreen.main.bounds.height)
                .clipped()
                .blur(radius: 12)
                .opacity(0.8)
                .scaleEffect(1.05)

            image
                .resizable()
                .aspectRatio(contentMode: .fill)
                .padding(.vertical, 90)
                .frame(width: frameWidth, height: frameHeight)
                .frame(maxWidth: .infinity, alignment: .center)
                .clipped()
        }
        .clipped()
    }

    private var failedView: some View {
        VStack(spacing: 12) {
            Image(systemName: "photo.badge.exclamationmark")
                .font(.system(size: 48)).foregroundColor(.white.opacity(0.5))
            Text("Nie można załadować")
                .font(.caption).foregroundColor(.white.opacity(0.5))
        }
    }
}
