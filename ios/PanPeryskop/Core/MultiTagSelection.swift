import Foundation

/// Multi-select tag filter shared by events and trips. All tags are selected by
/// default, the last one cannot be turned off, and the choice is remembered.
/// A tag that did not exist at the last choice joins the selected set.
struct MultiTagSelection {
    private let prefsKey: String
    private let knownKey: String
    private var userChose: Bool
    private(set) var selected: Set<String>
    private var known: Set<String>

    init(prefsKey: String) {
        self.prefsKey = prefsKey
        self.knownKey = "\(prefsKey).known"
        let savedKnown = UserDefaults.standard.array(forKey: knownKey) as? [String]
        known = savedKnown.map(Set.init) ?? []
        if let saved = UserDefaults.standard.array(forKey: prefsKey) as? [String], !saved.isEmpty {
            selected = Set(saved)
            userChose = true
        } else {
            selected = []
            userChose = false
        }
    }

    /// Default to all tags. Tags that no longer exist are dropped; a tag that did
    /// not exist at the last choice is added. A deliberate deselect is kept — the
    /// known universe tells a removed tag apart from a never-seen one.
    mutating func sync(all: Set<String>) {
        guard userChose else {
            selected = all
            known = all
            persist()
            return
        }
        let newTags = all.subtracting(known)
        selected = selected.intersection(all).union(newTags)
        if selected.isEmpty {
            selected = all
            userChose = false
        }
        known = all
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
        UserDefaults.standard.set(Array(known), forKey: knownKey)
    }
}
