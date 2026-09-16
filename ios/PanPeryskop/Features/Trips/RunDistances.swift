import Foundation

/// Distances offered by a run event. The provider sends "21.10km"; we show
/// "21.1 km". Sorted by value, smallest first.
enum RunDistances {
    static func tags(_ meta: TravelEventMeta?) -> [String] {
        let items = list(meta)
        if !items.isEmpty { return items.map(\.label) }
        if let single = meta?.distance, !single.isEmpty { return [single] }
        return []
    }

    static func range(_ meta: TravelEventMeta?) -> String? {
        let items = list(meta)
        guard let first = items.first, let last = items.last else {
            if let single = meta?.distance, !single.isEmpty { return single }
            return nil
        }
        guard first.kilometers != last.kilometers else { return first.label }
        return "\(first.label) – \(last.label)"
    }

    private static func list(_ meta: TravelEventMeta?) -> [Item] {
        var seen = Set<Double>()
        let items = (meta?.distances ?? [])
            .compactMap(Item.init(raw:))
            .filter { seen.insert($0.kilometers).inserted }
        return items.sorted { $0.kilometers < $1.kilometers }
    }

    struct Item: Hashable {
        let kilometers: Double

        var label: String { Self.label(kilometers) }

        init?(raw: String) {
            let digits = raw
                .lowercased()
                .replacingOccurrences(of: "km", with: "")
                .trimmingCharacters(in: .whitespaces)
            guard let value = Double(digits) else { return nil }
            kilometers = value
        }

        private static func label(_ kilometers: Double) -> String {
            let rounded = (kilometers * 100).rounded() / 100
            let number = rounded == rounded.rounded() ? String(Int(rounded)) : String(rounded)
            return "\(number) km"
        }
    }
}
