import Foundation

enum ProviderSortRank {
    private static let defaultRank = 999

    private static let ranks: [String: Int] = [
        "luma": 10,
        "going": 20,
        "kupbilecik": 30,
        "facebook": 40,
        "meetup": 50,
        "ebilet": 60,
        "eventim": 65,
        "maratonypolskie": 70,
        "mtp": 75,
        "residentadvisor": 80,
        "ra": 80,
        "ticketmaster": 85,
        "helios": 90,
        "multikino": 90,
        "cinemacity": 90,
    ]

    private struct SortEntry {
        let post: Post
        let time: String?
        let rank: Int
        let title: String
    }

    static func rank(for source: String?) -> Int {
        guard let key = source?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !key.isEmpty
        else { return defaultRank }
        return ranks[key] ?? defaultRank
    }

    static func effectiveTime(for post: Post) -> String? {
        let showtime = validShowtimes(for: post).min()
        return showtime ?? normalizedTime(post.eventInfo.time)
    }

    static func validShowtimes(for post: Post) -> [String] {
        var seen: Set<String> = []
        return (post.showtimes ?? [])
            .compactMap(normalizedTime)
            .filter { seen.insert($0).inserted }
    }

    static func normalizedTime(_ raw: String?) -> String? {
        guard let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty,
              trimmed != AppConstants.unknownTime
        else { return nil }
        let parts = trimmed.split(separator: ":")
        guard parts.count == 2,
              let hour = Int(parts[0]),
              let minute = Int(parts[1]),
              (0..<24).contains(hour),
              (0..<60).contains(minute)
        else { return nil }
        let formatted = String(format: "%02d:%02d", hour, minute)
        return formatted == AppConstants.unknownTime ? nil : formatted
    }

    static func sort(_ posts: [Post]) -> [Post] {
        posts
            .map(makeSortEntry)
            .sorted(by: areInOrder)
            .map(\.post)
    }

    private static func makeSortEntry(_ post: Post) -> SortEntry {
        SortEntry(
            post: post,
            time: effectiveTime(for: post),
            rank: rank(for: post.source),
            title: post.eventInfo.title
        )
    }

    private static func areInOrder(_ lhs: SortEntry, _ rhs: SortEntry) -> Bool {
        if lhs.time != rhs.time {
            return isEarlierTime(lhs.time, rhs.time)
        }
        if lhs.rank != rhs.rank {
            return lhs.rank < rhs.rank
        }
        let titleOrder = lhs.title.localizedStandardCompare(rhs.title)
        if titleOrder != .orderedSame {
            return titleOrder == .orderedAscending
        }
        return lhs.post.id < rhs.post.id
    }

    private static func isEarlierTime(_ lhs: String?, _ rhs: String?) -> Bool {
        switch (lhs, rhs) {
        case let (.some(a), .some(b)): return a < b
        case (.some, .none): return true
        case (.none, .some): return false
        case (.none, .none): return false
        }
    }
}
