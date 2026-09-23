import Foundation

extension URL {
    /// A provider sometimes ships a doubly-prefixed address ("http://Http://…"),
    /// which Safari cannot load. Keep one scheme, or return nil when nothing valid
    /// is left. Mirrors `normalizeLink` on the backend.
    static func normalized(_ raw: String?) -> URL? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        let stripped = trimmed.replacingOccurrences(
            of: "^(https?://)+",
            with: "",
            options: [.regularExpression, .caseInsensitive]
        )
        guard !stripped.isEmpty, !stripped.contains(" ") else { return nil }
        return URL(string: "https://\(stripped)")
    }
}
