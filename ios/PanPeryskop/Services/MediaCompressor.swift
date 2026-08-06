import UIKit
import AVFoundation
import FYVideoCompressor

enum MediaCompressor {
    static let maxUploadBytes = 100 * 1024 * 1024
    static let targetBytes = 90 * 1024 * 1024
    static let defaultBitrate = 4_000_000
    static let minBitrate = 1_000_000

    enum CompressError: Error {
        case tooLong
    }

    static func optimizePhoto(_ image: UIImage, maxDimension: CGFloat = 1080) -> Data? {
        let resized = image.resized(to: maxDimension)
        return resized.jpegData(compressionQuality: 0.8)
    }

    static func thumbnailData(_ image: UIImage, maxDimension: CGFloat = 320) -> Data? {
        let resized = image.resized(to: maxDimension)
        return resized.jpegData(compressionQuality: 0.7)
    }

    /// Compresses the video to fit under the backend's 100 MB upload limit.
    /// The bitrate is derived from the duration so a 5-minute clip still fits;
    /// if even the minimum acceptable bitrate would overflow, throws `.tooLong`.
    static func compressVideo(from sourceURL: URL) async throws -> URL {
        let duration = try await videoDuration(from: sourceURL)
        let bitrate = targetBitrate(duration: duration)
        guard bitrate >= minBitrate else {
            throw CompressError.tooLong
        }

        let outputURL = try await encode(from: sourceURL, bitrate: bitrate)
        if fileSize(of: outputURL) > maxUploadBytes, bitrate > minBitrate {
            let retryBitrate = max(Int(Double(bitrate) * 0.6), minBitrate)
            return try await encode(from: sourceURL, bitrate: retryBitrate)
        }
        return outputURL
    }

    private static func videoDuration(from url: URL) async throws -> TimeInterval {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration)
        return CMTimeGetSeconds(duration)
    }

    private static func targetBitrate(duration: TimeInterval) -> Int {
        guard duration > 0 else { return defaultBitrate }
        let bitsAvailable = Double(targetBytes) * 8
        let needed = Int(bitsAvailable / duration)
        return min(defaultBitrate, max(needed, 1))
    }

    private static func encode(from sourceURL: URL, bitrate: Int) async throws -> URL {
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp4")
        let config = FYVideoCompressor.CompressionConfig(
            videoBitrate: bitrate,
            videomaxKeyFrameInterval: 30,
            fps: 30,
            audioSampleRate: 44_100,
            audioBitrate: 96_000,
            fileType: .mp4,
            scale: CGSize(width: 1280, height: -1)
        )
        return try await withCheckedThrowingContinuation { continuation in
            FYVideoCompressor().compressVideo(sourceURL, config: config) { result in
                switch result {
                case .success(let url):
                    continuation.resume(returning: url)
                case .failure(let error):
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    private static func fileSize(of url: URL) -> Int {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attributes[.size] as? Int else {
            return 0
        }
        return size
    }
}
