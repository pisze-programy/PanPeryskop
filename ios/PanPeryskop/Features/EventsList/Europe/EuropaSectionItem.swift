import Foundation

enum EuropaSectionItem: Identifiable, Equatable {
    case countryHeader(id: String, title: String, isFirst: Bool)
    case event(id: String, event: TravelEvent, addsSectionSpacing: Bool)

    var id: String {
        switch self {
        case .countryHeader(let id, _, _):
            return id
        case .event(let id, _, _):
            return id
        }
    }
}
