import SwiftUI

/// A remote image that fills its space and is clipped to it. The clear rectangle
/// takes the proposed size, so the picture never changes the layout: the same
/// frame as whatever sits under it.
struct RemoteImage: View {
    let url: URL?
    var fadesIn = true

    @State private var image: UIImage?
    @State private var shown = false

    var body: some View {
        Rectangle()
            .fill(.clear)
            .overlay {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .opacity(shown ? 1 : 0)
                }
            }
            .clipped()
            .task(id: url) {
                guard let url else { return }
                if let hit = RemoteImageStore.shared.cached(url) {
                    image = hit
                    shown = true
                    return
                }
                let loaded = await RemoteImageStore.shared.load(url)
                guard !Task.isCancelled else { return }
                image = loaded
                if fadesIn {
                    withAnimation(.easeInOut(duration: 0.3)) { shown = loaded != nil }
                } else {
                    shown = loaded != nil
                }
            }
    }
}
