import Foundation

/// Multi-select tag filter shared by events and trips. All tags are selected by
/// default, the last one cannot be turned off, and the choice is remembered.
struct MultiTagSelection {
    private let prefsKey: String
    private var userChose: Bool
    private(set) var selected: Set<String>

    init(prefsKey: String) {
        self.prefsKey = prefsKey
        if let saved = UserDefaults.standard.array(forKey: prefsKey) as? [String], !saved.isEmpty {
            selected = Set(saved)
            userChose = true
        } else {
            selected = []
            userChose = false
        }
    }

    /// Default to all tags, drop tags that no longer exist, fall back to all if
    /// nothing remains.
    mutating func sync(all: Set<String>) {
        if !userChose {
            selected = all
            persist()
            return
        }
        selected.formIntersection(all)
        if selected.isEmpty {
            selected = all
            userChose = false
        }
        persist()
    }

    mutating func toggle(_ id: String) {
        if selected.contains(id) {
            guard selected.count > 1 else { return }
            selected.remove(id)
        } else {
            selected.insert(id)
        }
        userChose = true
        persist()
    }

    func isSelected(_ id: String) -> Bool { selected.contains(id) }

    /// Comma list for the API, or nil when every tag is selected (no filter).
    func param(all: Set<String>) -> String? {
        guard !selected.isEmpty, selected != all else { return nil }
        return selected.sorted().joined(separator: ",")
    }

    private func persist() {
        UserDefaults.standard.set(Array(selected), forKey: prefsKey)
    }
}
