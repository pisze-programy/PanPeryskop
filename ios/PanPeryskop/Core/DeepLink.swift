import Foundation

enum DeepLink {
    static let scheme = "panperyskop"
    static let host = "story"

    static func storyURL(id: String) -> String {
        "\(scheme)://\(host)/\(id)"
    }

    static func storyId(from url: URL) -> String? {
        guard let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
              comps.scheme == scheme, comps.host == host else { return nil }
        return comps.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }
}
