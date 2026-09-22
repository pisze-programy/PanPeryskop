import Foundation
import SwiftUI
@MainActor
final class RegionStore: ObservableObject {
    static let shared = RegionStore()

    @Published var current: Region {
        didSet { UserDefaults.standard.set(current.id, forKey: Self.key) }
    }

    private static let key = "app.region.id"

    private init() {
        let saved = UserDefaults.standard.string(forKey: Self.key) ?? ""
        current = Region.all.first { $0.id == saved } ?? .fallback
    }
}
