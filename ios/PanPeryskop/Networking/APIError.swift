import Foundation

/// Typed networking errors surfaced to callers.
enum APIError: Error {
    case server(statusCode: Int, message: String?)
    case cooldown(retryAfterMin: Int?)
    case invalidResponse

    var isTooLarge: Bool {
        if case .server(let code, _) = self { return code == 413 }
        return false
    }
}

struct ServerErrorBody: Decodable {
    let error: String
}