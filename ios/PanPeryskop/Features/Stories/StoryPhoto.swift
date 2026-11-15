import SwiftUI
import UIKit

struct StoryPhoto: View {
    let thumbURL: URL?
    let largeURL: URL
    let onLoaded: () -> Void

    @State private var thumb: UIImage?
    @State private var large: UIImage?
    @State private var loadedKey: TaskKey?
    @State private var failedKey: TaskKey?

    private struct TaskKey: Equatable {
        let thumbURL: URL?
        let largeURL: URL
    }

    private enum FetchResult: Sendable {
        case thumb(UIImage)
        case large(UIImage)
    }

    private var taskKey: TaskKey {
        TaskKey(thumbURL: thumbURL, largeURL: largeURL)
    }

    private var hasDistinctThumb: Bool {
        thumbURL != nil && thumbURL != largeURL
    }

    private var isFailed: Bool {
        failedKey == taskKey
    }

    private var shownThumb: UIImage? {
        if loadedKey == taskKey, let thumb { return thumb }
        guard hasDistinctThumb, let thumbURL else { return nil }
        return RemoteImageStore.shared.cached(thumbURL)
    }

    private var shownLarge: UIImage? {
        if loadedKey == taskKey, let large { return large }
        return RemoteImageStore.shared.cached(largeURL)
    }

    var body: some View {
        GeometryReader { geo in
            content(size: geo.size)
        }
        .clipped()
        .task(id: taskKey) { await load() }
    }

    private func content(size: CGSize) -> some View {
        ZStack(alignment: .center) {
            photoLayer(size: size)
            if isFailed {
                failedView
            }
        }
        .frame(width: size.width, height: size.height)
    }

    @ViewBuilder
    private func photoLayer(size: CGSize) -> some View {
        if let large = shownLarge {
            photoLayout(Image(uiImage: large), size: size)
        } else if let thumb = shownThumb {
            photoLayout(Image(uiImage: thumb), size: size).blur(radius: 3)
        }
    }

    private func load() async {
        let key = taskKey
        resetState(for: key)
        if let hit = RemoteImageStore.shared.cached(key.largeURL) {
            large = hit
            onLoaded()
            return
        }
        var didNotify = applyCachedThumbIfAvailable(for: key)
        await fetchRemaining(for: key, didNotify: &didNotify)
        guard !Task.isCancelled else { return }
        if large == nil && shownThumb == nil {
            failedKey = key
        }
    }

    private func resetState(for key: TaskKey) {
        loadedKey = key
        failedKey = nil
        thumb = nil
        large = nil
    }

    private func applyCachedThumbIfAvailable(for key: TaskKey) -> Bool {
        guard hasDistinctThumb,
              let thumbURL = key.thumbURL,
              let hit = RemoteImageStore.shared.cached(thumbURL) else {
            return false
        }
        thumb = hit
        onLoaded()
        return true
    }

    private func fetchRemaining(for key: TaskKey, didNotify: inout Bool) async {
        await withTaskGroup(of: FetchResult?.self) { group in
            enqueueFetchTasks(in: &group, for: key)
            for await result in group {
                consumeFetchResult(result, didNotify: &didNotify)
            }
        }
    }

    private func consumeFetchResult(_ result: FetchResult?, didNotify: inout Bool) {
        guard !Task.isCancelled else { return }
        handleResult(result, didNotify: &didNotify)
    }

    private func enqueueFetchTasks(in group: inout TaskGroup<FetchResult?>, for key: TaskKey) {
        if hasDistinctThumb,
           let thumbURL = key.thumbURL,
           RemoteImageStore.shared.cached(thumbURL) == nil {
            group.addTask { await loadThumb(thumbURL) }
        }
        group.addTask { await loadLarge(key.largeURL) }
    }

    private func handleResult(_ result: FetchResult?, didNotify: inout Bool) {
        switch result {
        case .large(let image):
            applyLarge(image, didNotify: &didNotify)
        case .thumb(let image):
            applyThumb(image, didNotify: &didNotify)
        case .none:
            break
        }
    }

    private func applyLarge(_ image: UIImage, didNotify: inout Bool) {
        large = image
        thumb = nil
        notifyOnce(&didNotify)
    }

    private func applyThumb(_ image: UIImage, didNotify: inout Bool) {
        guard large == nil else { return }
        thumb = image
        notifyOnce(&didNotify)
    }

    private func loadThumb(_ url: URL) async -> FetchResult? {
        guard let image = await RemoteImageStore.shared.load(url) else { return nil }
        return .thumb(image)
    }

    private func loadLarge(_ url: URL) async -> FetchResult? {
        guard let image = await RemoteImageStore.shared.load(url) else { return nil }
        return .large(image)
    }

    private func notifyOnce(_ didNotify: inout Bool) {
        guard !didNotify else { return }
        didNotify = true
        onLoaded()
    }

    private func photoLayout(_ image: Image, size: CGSize) -> some View {
        let frameHeight = size.height * 0.7
        let frameWidth = frameHeight * 9 / 16
        return ZStack(alignment: .center) {
            image
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: size.width, height: size.height)
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
