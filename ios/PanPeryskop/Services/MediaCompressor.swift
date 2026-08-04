import UIKit
import FYVideoCompressor

enum MediaCompressor {
    static func optimizePhoto(_ image: UIImage, maxDimension: CGFloat = 1080) -> Data? {
        let resized = image.resized(to: maxDimension)
        return resized.jpegData(compressionQuality: 0.8)
    }

    static func thumbnailData(_ image: UIImage, maxDimension: CGFloat = 320) -> Data? {
        let resized = image.resized(to: maxDimension)
        return resized.jpegData(compressionQuality: 0.7)
    }

    static func compressVideo(from sourceURL: URL) async throws -> URL {
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp4")
        let config = FYVideoCompressor.CompressionConfig(
            videoBitrate: 4_000_000,
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
}
