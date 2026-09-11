import Foundation

/// Orders tag chips by event count. Pure + testable — the view model just feeds it
/// the catalog and the counts.
///
/// Rules: higher count first; ties alphabetically. Exception: the "inne" catch-all
/// is pushed last when it has zero events and more than one tag is empty.
enum TagSorting {
    static func sorted(_ tags: [TagPill], counts: [String: Int]) -> [TagPill] {
        let emptyCount = tags.filter { (counts[$0.id] ?? 0) == 0 }.count
        return tags.sorted { a, b in
            let ca = counts[a.id] ?? 0
            let cb = counts[b.id] ?? 0
            if ca != cb { return ca > cb }
            if ca == 0, emptyCount > 1 {
                if a.id == "inne" { return false }
                if b.id == "inne" { return true }
            }
            return a.label.localizedCaseInsensitiveCompare(b.label) == .orderedAscending
        }
    }
}