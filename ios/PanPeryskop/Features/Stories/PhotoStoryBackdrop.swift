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
    @State private var loadedKey: TaskKey?

    private struct TaskKey: Equatable {
        let url: URL?
        let thumbURL: URL?
    }

    private enum FetchResult: Sendable {
        case thumb(UIImage)
        case full(UIImage)
    }

    private var taskKey: TaskKey {
        TaskKey(url: url, thumbURL: thumbURL)
    }

    var body: some View {
        GeometryReader { geo in
            Color.black
                .overlay { content(height: geo.size.height) }
                .clipped()
        }
        .accessibilityHidden(true)
        .task(id: taskKey) { await load() }
    }

    @ViewBuilder
    private func content(height: CGFloat) -> some View {
        if let image = shown {
            treated(Image(uiImage: image), height: height)
        }
    }

    private var shown: UIImage? {
        if loadedKey == taskKey, let loaded { return loaded }
        if let url, let hit = RemoteImageStore.shared.cached(url) { return hit }
        if let thumbURL, let hit = RemoteImageStore.shared.cached(thumbURL) { return hit }
        return nil
    }

    private func load() async {
        let key = taskKey
        loaded = nil
        loadedKey = nil
        if let hit = cachedFull(for: key) {
            apply(hit, for: key)
            onLoaded()
            return
        }
        var didNotify = notifyIfCachedThumb(for: key)
        await fetchRemaining(for: key, didNotify: &didNotify)
    }

    private func cachedFull(for key: TaskKey) -> UIImage? {
        guard let url = key.url else { return nil }
        return RemoteImageStore.shared.cached(url)
    }

    private func notifyIfCachedThumb(for key: TaskKey) -> Bool {
        guard let thumbURL = key.thumbURL,
              let hit = RemoteImageStore.shared.cached(thumbURL) else {
            return false
        }
        apply(hit, for: key)
        onLoaded()
        return true
    }

    private func fetchRemaining(for key: TaskKey, didNotify: inout Bool) async {
        var hasFull = false
        await withTaskGroup(of: FetchResult?.self) { group in
            enqueueFetchTasks(in: &group, for: key)
            for await result in group {
                consumeFetchResult(result, for: key, hasFull: &hasFull, didNotify: &didNotify)
            }
        }
    }

    private func consumeFetchResult(
        _ result: FetchResult?,
        for key: TaskKey,
        hasFull: inout Bool,
        didNotify: inout Bool
    ) {
        guard !Task.isCancelled else { return }
        handleResult(result, for: key, hasFull: &hasFull, didNotify: &didNotify)
    }

    private func enqueueFetchTasks(in group: inout TaskGroup<FetchResult?>, for key: TaskKey) {
        if let thumbURL = key.thumbURL,
           thumbURL != key.url,
           RemoteImageStore.shared.cached(thumbURL) == nil {
            group.addTask { await loadThumb(thumbURL) }
        }
        if let url = key.url {
            group.addTask { await loadFull(url) }
        }
    }

    private func handleResult(
        _ result: FetchResult?,
        for key: TaskKey,
        hasFull: inout Bool,
        didNotify: inout Bool
    ) {
        switch result {
        case .full(let image):
            applyFull(image, for: key, hasFull: &hasFull, didNotify: &didNotify)
        case .thumb(let image):
            applyThumb(image, for: key, hasFull: hasFull, didNotify: &didNotify)
        case .none:
            break
        }
    }

    private func applyFull(
        _ image: UIImage,
        for key: TaskKey,
        hasFull: inout Bool,
        didNotify: inout Bool
    ) {
        hasFull = true
        apply(image, for: key)
        notifyOnce(&didNotify)
    }

    private func applyThumb(
        _ image: UIImage,
        for key: TaskKey,
        hasFull: Bool,
        didNotify: inout Bool
    ) {
        guard !hasFull else { return }
        apply(image, for: key)
        notifyOnce(&didNotify)
    }

    private func loadThumb(_ url: URL) async -> FetchResult? {
        guard let image = await RemoteImageStore.shared.load(url) else { return nil }
        return .thumb(image)
    }

    private func loadFull(_ url: URL) async -> FetchResult? {
        guard let image = await RemoteImageStore.shared.load(url) else { return nil }
        return .full(image)
    }

    private func apply(_ image: UIImage, for key: TaskKey) {
        loaded = image
        loadedKey = key
    }

    private func notifyOnce(_ didNotify: inout Bool) {
        guard !didNotify else { return }
        didNotify = true
        onLoaded()
    }

    private func treated(_ image: Image, height: CGFloat) -> some View {
        image
            .resizable()
            .aspectRatio(contentMode: .fill)
            .scaleEffect(Self.scale)
            .saturation(0.6)
            .offset(y: shift(height: height))
    }

    private func shift(height: CGFloat) -> CGFloat {
        let sum = shiftSeed.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFFFF }
        let unit = CGFloat(sum % 1000) / 1000 - 0.5
        return unit * 2 * Self.maxShiftFraction * height
    }
}
