import SwiftUI
import CoreLocation

@MainActor
final class StaysWidgetLoader: ObservableObject {
    @Published private(set) var url: URL?
    @Published private(set) var failed = false
    private var loadedKey = ""

    func load(_ query: StaysWidgetQuery) async {
        guard query.key != loadedKey else { return }
        failed = false
        url = nil
        do {
            let next = try await APIClient.getStaysWidgetURL(query)
            guard !Task.isCancelled else { return }
            loadedKey = query.key
            url = next
            failed = next == nil
        } catch {
            guard !(error is CancellationError) else { return }
            failed = true
        }
    }

    func reload(_ query: StaysWidgetQuery) async {
        loadedKey = ""
        await load(query)
    }
}
