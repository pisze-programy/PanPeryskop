import UIKit

@MainActor
final class RemoteImageStore {
    static let shared = RemoteImageStore()

    private static let countLimit = 240
    private static let totalCostLimit = 64 * 1024 * 1024

    private let cache = NSCache<NSURL, UIImage>()
    private var running: [URL: LoadEntry] = [:]

    private init() {
        cache.countLimit = Self.countLimit
        cache.totalCostLimit = Self.totalCostLimit
    }

    func cached(_ url: URL) -> UIImage? {
        cache.object(forKey: url as NSURL)
    }

    func load(_ url: URL) async -> UIImage? {
        if let hit = cached(url) { return hit }
        if Task.isCancelled { return nil }
        let waiterID = UUID()
        return await withTaskCancellationHandler {
            await registerAndWait(waiterID: waiterID, for: url)
        } onCancel: {
            Task { @MainActor [weak self] in
                self?.cancelWaiter(waiterID, for: url)
            }
        }
    }

    private func registerAndWait(waiterID: UUID, for url: URL) async -> UIImage? {
        await withCheckedContinuation { continuation in
            guard !Task.isCancelled else {
                continuation.resume(returning: nil)
                return
            }
            var entry = running[url] ?? startEntry(for: url)
            entry.waiters[waiterID] = continuation
            running[url] = entry
        }
    }

    private func startEntry(for url: URL) -> LoadEntry {
        var entry = LoadEntry()
        let token = entry.token
        entry.task = Task.detached(priority: .utility) { [weak self] in
            let image = await Self.fetchAndDecode(url)
            await self?.finish(token, url: url, image: image)
        }
        return entry
    }

    private func cancelWaiter(_ waiterID: UUID, for url: URL) {
        guard var entry = running[url],
              let continuation = entry.waiters.removeValue(forKey: waiterID) else {
            return
        }
        running[url] = entry
        continuation.resume(returning: nil)
        guard entry.waiters.isEmpty else { return }
        entry.task?.cancel()
        running[url] = nil
    }

    private func finish(_ token: UUID, url: URL, image: UIImage?) {
        guard let entry = running[url], entry.token == token else { return }
        running[url] = nil
        if let image { store(image, for: url) }
        resumeWaiters(of: entry, with: image)
    }

    private func store(_ image: UIImage, for url: URL) {
        cache.setObject(image, forKey: url as NSURL, cost: Self.imageCost(image))
    }

    private func resumeWaiters(of entry: LoadEntry, with image: UIImage?) {
        for continuation in entry.waiters.values {
            continuation.resume(returning: image)
        }
    }

    nonisolated private static func fetchAndDecode(_ url: URL) async -> UIImage? {
        guard !Task.isCancelled else { return nil }
        guard let (data, response) = try? await URLSession.shared.data(from: url) else { return nil }
        guard isValidResponse(response), !Task.isCancelled else { return nil }
        guard let raw = UIImage(data: data) else { return nil }
        guard !Task.isCancelled else { return nil }
        return await raw.byPreparingForDisplay() ?? raw
    }

    nonisolated private static func isValidResponse(_ response: URLResponse) -> Bool {
        guard let http = response as? HTTPURLResponse else { return true }
        return (200..<300).contains(http.statusCode)
    }

    nonisolated private static func imageCost(_ image: UIImage) -> Int {
        let bytes = image.cgImage.map { $0.bytesPerRow * $0.height }
            ?? Int(image.size.width * image.size.height * image.scale * image.scale * 4)
        return max(1, bytes)
    }

    private struct LoadEntry {
        let token = UUID()
        var waiters: [UUID: CheckedContinuation<UIImage?, Never>] = [:]
        var task: Task<Void, Never>?
    }
}
