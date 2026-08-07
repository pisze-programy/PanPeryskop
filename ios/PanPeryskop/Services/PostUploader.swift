import Foundation

/// Processes the pending-post queue in the background: compress (video) → upload.
/// Success: silent delete of the local copy. Failure: up to 3 retries (persisted);
/// after that, report to the DLQ (`/client/errors`) and delete. Posts older than
/// 12 h from the publish attempt are dropped as stale and reported too.
final class PostUploader: @unchecked Sendable {
    static let shared = PostUploader()

    private let store = PendingPostsStore.shared
    private let maxRetries = 3
    private let staleAfter: TimeInterval = 12 * 3600
    private let processingLock = NSLock()
    private var isProcessing = false

    private init() {
        NetworkMonitor.shared.onStatusChange = { [weak self] reachable in
            if reachable { self?.start() }
        }
    }

    func start() {
        processingLock.lock()
        if isProcessing {
            processingLock.unlock()
            return
        }
        isProcessing = true
        processingLock.unlock()

        Task.detached(priority: .utility) { [weak self] in
            await self?.processAll()
            self?.finishProcessing()
        }
    }

    private func finishProcessing() {
        processingLock.lock()
        isProcessing = false
        processingLock.unlock()
    }

    private func processAll() async {
        for post in store.all {
            await process(post)
        }
    }

    private func process(_ post: PendingPost) async {
        let age = Date().timeIntervalSince1970 * 1000 - Double(post.createdAt)
        if age > staleAfter * 1000 {
            await report(post, type: "stale_drop", message: "Pending post dropped (stale)")
            store.remove(id: post.id)
            return
        }

        var current = post
        while store.post(id: current.id) != nil {
            guard NetworkMonitor.shared.isReachable else { return }

            do {
                try await upload(current)
                store.remove(id: current.id)
                return
            } catch {
                store.incrementRetry(id: current.id)
                let retries = store.post(id: current.id)?.retryCount ?? 0
                if retries >= maxRetries {
                    await report(current, type: "upload_failed", message: error.localizedDescription, retries: retries)
                    store.remove(id: current.id)
                    return
                }
                current = store.post(id: current.id) ?? current
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }
        }
    }

    private func upload(_ post: PendingPost) async throws {
        let mediaData: Data
        if post.type == "video" {
            let url = store.mediaURL(for: post)
            let compressedURL = try await MediaCompressor.compressVideo(from: url)
            mediaData = try Data(contentsOf: compressedURL)
            try? FileManager.default.removeItem(at: compressedURL)
        } else {
            mediaData = try Data(contentsOf: store.mediaURL(for: post))
        }

        let thumb: Data?
        if let thumbURL = store.thumbURL(for: post) {
            thumb = try? Data(contentsOf: thumbURL)
        } else {
            thumb = nil
        }

        let mimeType = post.type == "video" ? "video/mp4" : "image/jpeg"
        let ext = post.type == "video" ? "mp4" : "jpg"
        _ = try await APIClient.uploadMedia(
            "/posts", fileData: mediaData, fileName: "capture.\(ext)", mimeType: mimeType,
            thumbData: thumb,
            fields: ["type": post.type, "lat": String(post.lat), "lng": String(post.lng), "description": post.description]
        )
    }

    private func report(_ post: PendingPost, type: String, message: String, retries: Int? = nil) async {
        var meta: [String: Any] = [
            "post_id": post.id,
            "type": post.type,
            "age_s": Int(Date().timeIntervalSince1970 - Double(post.createdAt) / 1000),
        ]
        if let retries { meta["retries"] = retries }
        await APIClient.reportClientError(errorType: type, message: message, meta: meta)
    }
}
