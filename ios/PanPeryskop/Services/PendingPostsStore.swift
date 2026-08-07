import Foundation
import UIKit

/// Persistent queue of posts waiting for background upload.
/// Media lives in `Application Support/PanPeryskop/PendingPosts/`, the index in
/// `index.json`. All mutations are lock-protected (worker runs off the main thread).
final class PendingPostsStore: @unchecked Sendable {
    static let shared = PendingPostsStore()

    private let fileManager = FileManager.default
    private let directory: URL
    private let indexURL: URL
    private let lock = NSLock()
    private var posts: [PendingPost] = []

    private init() {
        let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PanPeryskop", isDirectory: true)
            .appendingPathComponent("PendingPosts", isDirectory: true)
        directory = base
        indexURL = base.appendingPathComponent("index.json")
        try? fileManager.createDirectory(at: base, withIntermediateDirectories: true)
        loadIndex()
    }

    var all: [PendingPost] {
        lock.lock()
        defer { lock.unlock() }
        return posts
    }

    func post(id: String) -> PendingPost? {
        lock.lock()
        defer { lock.unlock() }
        return posts.first { $0.id == id }
    }

    @discardableResult
    func enqueue(photoData: Data, lat: Double, lng: Double, description: String) -> Bool {
        let id = UUID().uuidString
        let mediaName = "\(id).jpg"
        guard write(photoData, filename: mediaName) else { return false }

        var thumbName: String?
        if let thumb = MediaCompressor.thumbnailData(UIImage(data: photoData) ?? UIImage()) {
            thumbName = "\(id)_thumb.jpg"
            _ = write(thumb, filename: thumbName!)
        }

        return append(PendingPost(
            id: id, type: "photo", mediaPath: mediaName, thumbPath: thumbName,
            lat: lat, lng: lng, description: description,
            createdAt: Int64(Date().timeIntervalSince1970 * 1000), retryCount: 0
        ))
    }

    @discardableResult
    func enqueue(videoURL: URL, thumbData: Data?, lat: Double, lng: Double, description: String) -> Bool {
        let id = UUID().uuidString
        let mediaName = "\(id)\(videoURL.pathExtension.isEmpty ? ".mov" : ".\(videoURL.pathExtension)")"
        do {
            let dest = directory.appendingPathComponent(mediaName)
            try fileManager.copyItem(at: videoURL, to: dest)
        } catch {
            print("PendingPostsStore: copy video failed:", error)
            return false
        }

        var thumbName: String?
        if let thumbData {
            thumbName = "\(id)_thumb.jpg"
            _ = write(thumbData, filename: thumbName!)
        }

        return append(PendingPost(
            id: id, type: "video", mediaPath: mediaName, thumbPath: thumbName,
            lat: lat, lng: lng, description: description,
            createdAt: Int64(Date().timeIntervalSince1970 * 1000), retryCount: 0
        ))
    }

    func mediaURL(for post: PendingPost) -> URL {
        directory.appendingPathComponent(post.mediaPath)
    }

    func thumbURL(for post: PendingPost) -> URL? {
        guard let path = post.thumbPath else { return nil }
        return directory.appendingPathComponent(path)
    }

    func remove(id: String) {
        lock.lock()
        guard let index = posts.firstIndex(where: { $0.id == id }) else {
            lock.unlock()
            return
        }
        let post = posts.remove(at: index)
        lock.unlock()

        deleteFile(post.mediaPath)
        if let thumb = post.thumbPath { deleteFile(thumb) }
        saveIndex()
    }

    func incrementRetry(id: String) {
        lock.lock()
        defer { lock.unlock() }
        guard let index = posts.firstIndex(where: { $0.id == id }) else { return }
        posts[index].retryCount += 1
        saveIndex()
    }

    // MARK: - Persistence

    private func append(_ post: PendingPost) -> Bool {
        lock.lock()
        posts.append(post)
        lock.unlock()
        saveIndex()
        return true
    }

    private func write(_ data: Data, filename: String) -> Bool {
        do {
            try data.write(to: directory.appendingPathComponent(filename))
            return true
        } catch {
            print("PendingPostsStore: write failed:", error)
            return false
        }
    }

    private func deleteFile(_ filename: String) {
        try? fileManager.removeItem(at: directory.appendingPathComponent(filename))
    }

    private func loadIndex() {
        lock.lock()
        defer { lock.unlock() }
        guard let data = try? Data(contentsOf: indexURL) else { return }
        posts = (try? JSONDecoder().decode([PendingPost].self, from: data)) ?? []
    }

    private func saveIndex() {
        lock.lock()
        let data = try? JSONEncoder().encode(posts)
        lock.unlock()
        guard let data else { return }
        try? data.write(to: indexURL)
    }
}
