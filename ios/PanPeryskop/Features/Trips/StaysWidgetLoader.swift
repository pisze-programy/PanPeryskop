import Foundation

@MainActor
final class StaysWidgetLoader: ObservableObject {
    @Published private(set) var url: URL?
    @Published private(set) var failed = false
    @Published private(set) var isLoading = false
    private var loadedKey = ""

    /// URLs are stable per query; reuse them across sheet opens.
    private static var cache: [String: URL] = [:]

    func load(_ query: StaysWidgetQuery) async {
        guard query.key != loadedKey else { return }
        loadedKey = query.key
        failed = false
        if let cached = Self.cache[query.key] {
            url = cached
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let next = try await APIClient.getStaysWidgetURL(query)
            guard !Task.isCancelled else { return }
            if let next { Self.cache[query.key] = next }
            url = next
            failed = next == nil
        } catch {
            guard !(error is CancellationError) else { return }
            // Keep the current map when one is already shown.
            failed = url == nil
        }
    }

    func reload(_ query: StaysWidgetQuery) async {
        loadedKey = ""
        Self.cache[query.key] = nil
        url = nil
        await load(query)
    }
}
