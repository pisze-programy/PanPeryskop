import Foundation

// MARK: - Posts

extension APIClient {
    static func uploadMedia(
        _ path: String,
        fileData: Data,
        fileName: String,
        mimeType: String,
        thumbData: Data?,
        fields: [String: String]
    ) async throws -> CreatePostResponse {
        var files = [MultipartFile(name: "file", filename: fileName, mimeType: mimeType, data: fileData)]
        if let thumbData {
            files.append(MultipartFile(name: "thumb", filename: "thumb.jpg", mimeType: "image/jpeg", data: thumbData))
        }
        return try await http.upload(path, fields: fields, files: files)
    }
}