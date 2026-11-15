import SwiftUI

struct RemoteImage: View {
    let url: URL?
    var fadesIn = true

    @State private var image: UIImage?
    @State private var loadedURL: URL?

    var body: some View {
        Rectangle()
            .fill(.clear)
            .overlay { content }
            .clipped()
            .task(id: url) { await loadImage() }
    }

    @ViewBuilder
    private var content: some View {
        if let displayedImage {
            Image(uiImage: displayedImage)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .transition(insertionTransition)
        }
    }

    private var insertionTransition: AnyTransition {
        fadesIn ? .asymmetric(insertion: .opacity, removal: .identity) : .identity
    }

    private var displayedImage: UIImage? {
        guard let url else { return nil }
        if loadedURL == url { return image }
        return RemoteImageStore.shared.cached(url)
    }

    private func loadImage() async {
        guard let url else {
            resetState()
            return
        }
        if let hit = RemoteImageStore.shared.cached(url) {
            applyImmediate(hit, for: url)
            return
        }
        resetState()
        let loaded = await RemoteImageStore.shared.load(url)
        guard !Task.isCancelled else { return }
        applyLoaded(loaded, for: url)
    }

    private func resetState() {
        loadedURL = nil
        image = nil
    }

    private func applyImmediate(_ hit: UIImage?, for url: URL) {
        loadedURL = url
        image = hit
    }

    private func applyLoaded(_ loaded: UIImage?, for url: URL) {
        guard fadesIn, loaded != nil else {
            applyImmediate(loaded, for: url)
            return
        }
        withAnimation(.easeInOut(duration: 0.3)) {
            loadedURL = url
            image = loaded
        }
    }
}
