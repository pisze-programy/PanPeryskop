import Foundation

/// Travel catalogue source of truth: the bundled baseline, refreshed from the
/// backend and cached on disk. Must work offline, so a failed refresh keeps the
/// current data.
@MainActor
final class CatalogueStore: ObservableObject {
    static let shared = CatalogueStore()

    @Published private(set) var catalogue: TravelCatalogue
    /// Soft nudge only: the app keeps working, the user is told to update.
    @Published private(set) var updateSuggested: Bool

    /// Highest catalogue schema this build understands.
    static let supportedSchemaVersion = 1

    private let fileManager = FileManager.default
    private let cacheURL: URL

    private init() {
        let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PanPeryskop", isDirectory: true)
        try? fileManager.createDirectory(at: base, withIntermediateDirectories: true)
        cacheURL = base.appendingPathComponent("catalogue.json")
        let initial = Self.readCache(cacheURL) ?? .bundled
        catalogue = initial
        updateSuggested = Self.isBehind(initial)
    }

    var cities: [CatalogueCity] { catalogue.cities }

    /// First city in the catalogue. The fallback only guards an empty catalogue.
    var defaultCity: City {
        cities.first?.city ?? City(id: "warszawa", name: "Warszawa", lat: 52.2297, lng: 21.0122)
    }

    func city(id: String) -> City? { catalogue.city(id: id)?.city }

    func refresh() async {
        let fetched: TravelCatalogue?
        do {
            fetched = try await APIClient.getCatalogue(etag: catalogue.version)
        } catch {
            return
        }
        guard let fetched, fetched.version != catalogue.version else { return }
        catalogue = fetched
        updateSuggested = Self.isBehind(fetched)
        Self.writeCache(fetched, to: cacheURL)
    }

    private static func isBehind(_ catalogue: TravelCatalogue) -> Bool {
        if catalogue.schemaVersion > supportedSchemaVersion { return true }
        guard let build = Int(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "") else { return false }
        return build < catalogue.minAppBuild
    }

    private static func readCache(_ url: URL) -> TravelCatalogue? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(TravelCatalogue.self, from: data)
    }

    private static func writeCache(_ catalogue: TravelCatalogue, to url: URL) {
        guard let data = try? JSONEncoder().encode(catalogue) else { return }
        try? data.write(to: url, options: .atomic)
    }
}
