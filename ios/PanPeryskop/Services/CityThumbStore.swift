import ImageIO
import UIKit

@MainActor
enum CityThumbStore {
    private static let countLimit = 180
    private static let totalCostLimit = 24 * 1024 * 1024

    private static let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = countLimit
        cache.totalCostLimit = totalCostLimit
        return cache
    }()

    private static var missingIDs: Set<String> = []
    private static var running: [String: LoadEntry] = [:]

    static func cached(_ id: String) -> UIImage? {
        cache.object(forKey: id as NSString)
    }

    static func isMissing(_ id: String) -> Bool {
        missingIDs.contains(id)
    }

    static func image(for id: String) -> UIImage? {
        if let hit = cached(id) { return hit }
        if missingIDs.contains(id) { return nil }
        guard let url = bundleURL(for: id),
              let raw = UIImage(contentsOfFile: url.path) else {
            missingIDs.insert(id)
            return nil
        }
        let prepared = raw.preparingForDisplay() ?? raw
        store(prepared, for: id)
        return prepared
    }

    static func load(_ id: String) async -> UIImage? {
        if let hit = cached(id) { return hit }
        if missingIDs.contains(id) || Task.isCancelled { return nil }
        guard let url = bundleURL(for: id) else {
            missingIDs.insert(id)
            return nil
        }
        let waiterID = UUID()
        return await withTaskCancellationHandler {
            await registerAndWait(waiterID: waiterID, id: id, url: url)
        } onCancel: {
            Task { @MainActor in
                cancelWaiter(waiterID, for: id)
            }
        }
    }

    private static func registerAndWait(waiterID: UUID, id: String, url: URL) async -> UIImage? {
        await withCheckedContinuation { continuation in
            guard !Task.isCancelled else {
                continuation.resume(returning: nil)
                return
            }
            var entry = running[id] ?? startEntry(for: id, url: url)
            entry.waiters[waiterID] = continuation
            running[id] = entry
        }
    }

    private static func startEntry(for id: String, url: URL) -> LoadEntry {
        var entry = LoadEntry()
        let token = entry.token
        entry.task = Task.detached(priority: .utility) {
            let image = await decodeBundleImage(at: url)
            await finish(token, id: id, image: image)
        }
        return entry
    }

    private static func cancelWaiter(_ waiterID: UUID, for id: String) {
        guard var entry = running[id],
              let continuation = entry.waiters.removeValue(forKey: waiterID) else {
            return
        }
        running[id] = entry
        continuation.resume(returning: nil)
        guard entry.waiters.isEmpty else { return }
        entry.task?.cancel()
        running[id] = nil
    }

    private static func finish(_ token: UUID, id: String, image: UIImage?) {
        guard let entry = running[id], entry.token == token else { return }
        running[id] = nil
        recordResult(image, for: id, cancelled: entry.task?.isCancelled == true)
        resumeWaiters(of: entry, with: image)
    }

    private static func recordResult(_ image: UIImage?, for id: String, cancelled: Bool) {
        if let image {
            store(image, for: id)
            return
        }
        guard !cancelled else { return }
        missingIDs.insert(id)
    }

    private static func resumeWaiters(of entry: LoadEntry, with image: UIImage?) {
        for continuation in entry.waiters.values {
            continuation.resume(returning: image)
        }
    }

    private static func bundleURL(for id: String) -> URL? {
        Bundle.main.url(forResource: "CityThumbs/\(id)", withExtension: "webp")
    }

    private static func store(_ image: UIImage, for id: String) {
        cache.setObject(image, forKey: id as NSString, cost: imageCost(image))
    }

    nonisolated private static func decodeBundleImage(at url: URL) async -> UIImage? {
        guard !Task.isCancelled else { return nil }
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            return nil
        }
        guard !Task.isCancelled else { return nil }
        let raw = UIImage(cgImage: cgImage)
        return await raw.byPreparingForDisplay() ?? raw
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
