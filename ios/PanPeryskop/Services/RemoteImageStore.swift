import UIKit

/// Remote images with an in-memory cache and off-main decoding. `AsyncImage`
/// keeps no cache, so every re-render re-requested and re-decoded the picture.
@MainActor
final class RemoteImageStore {
    static let shared = RemoteImageStore()

    private let cache = NSCache<NSURL, UIImage>()
    private var running: [URL: Task<UIImage?, Never>] = [:]

    private init() {
        cache.countLimit = 400
    }

    func cached(_ url: URL) -> UIImage? {
        cache.object(forKey: url as NSURL)
    }

    func load(_ url: URL) async -> UIImage? {
        if let hit = cached(url) { return hit }
        if let task = running[url] { return await task.value }
        let task = Task<UIImage?, Never> { [cache] in
            guard let (data, _) = try? await URLSession.shared.data(from: url) else { return nil }
            let image = await Task.detached(priority: .utility) { UIImage(data: data) }.value
            if let image { cache.setObject(image, forKey: url as NSURL) }
            return image
        }
        running[url] = task
        let image = await task.value
        running[url] = nil
        return image
    }
}
