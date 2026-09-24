import SwiftUI
import UIKit

struct PhotoStoryBackdrop: View {
    let url: URL?
    let thumbURL: URL?
    let shiftSeed: String
    let onLoaded: () -> Void

    private static let maxShiftFraction: CGFloat = 0.03
    private static let scale: CGFloat = 1.08

    @State private var loaded: UIImage?

    var body: some View {
        Color.black
            .overlay {
                if let image = shown {
                    treated(Image(uiImage: image))
                }
            }
            .clipped()
            .accessibilityHidden(true)
            .task(id: url) { await load() }
    }

    private var shown: UIImage? {
        if let loaded { return loaded }
        if let url, let hit = RemoteImageStore.shared.cached(url) { return hit }
        if let thumbURL, let hit = RemoteImageStore.shared.cached(thumbURL) { return hit }
        return nil
    }

    private func load() async {
        if let thumbURL, loaded == nil, let thumb = await RemoteImageStore.shared.load(thumbURL) {
            loaded = thumb
            onLoaded()
        }
        if let url, let full = await RemoteImageStore.shared.load(url) {
            loaded = full
            onLoaded()
        }
    }

    private func treated(_ image: Image) -> some View {
        image
            .resizable()
            .aspectRatio(contentMode: .fill)
            .scaleEffect(Self.scale)
            .saturation(0.6)
            .offset(y: shift)
    }

    private var shift: CGFloat {
        let sum = shiftSeed.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFFFF }
        let unit = CGFloat(sum % 1000) / 1000 - 0.5
        return unit * 2 * Self.maxShiftFraction * 800
    }
}
