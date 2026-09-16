import SwiftUI

/// Top filter bar of the map: picker pill (city / airport) + category-appropriate chips.
struct MapFilterBar: View {
    let category: MapCategory
    @ObservedObject var mapViewModel: MapViewModel
    @ObservedObject var tripsViewModel: TripsViewModel
    let onCityTap: () -> Void
    let onAirportTap: () -> Void
    let onDayTap: () -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.s) {
                switch category {
                case .events:
                    MapPickerPill(title: mapViewModel.dayLabel(offset: mapViewModel.selectedDayOffset), action: onDayTap)
                    MapPickerPill(title: mapViewModel.selectedCity.name, action: onCityTap)
                        .padding(.trailing, 12)
                    ForEach(mapViewModel.sortedTags) { tag in
                        eventChip(tag.label, selected: mapViewModel.isTagSelected(tag.id), badge: mapViewModel.tagCounts[tag.id] ?? 0) {
                            mapViewModel.toggleTag(tag.id)
                        }
                    }
                case .trips:
                    MapPickerPill(
                        title: "\(tripsViewModel.selectedAirport.iata) · \(tripsViewModel.selectedAirport.city)",
                        action: onAirportTap
                    )
                    Chip(label: "Wszystkie", isSelected: tripsViewModel.selectedTag == nil, badgeCount: tripsViewModel.tagTotalCount, showsBadgeWhenEmpty: true) {
                        tripsViewModel.selectTag(nil)
                    }
                    .padding(.leading, 10)
                    ForEach(TripsViewModel.TravelTag.allCases) { tag in
                        Chip(label: tag.label, isSelected: tripsViewModel.selectedTag == tag, badgeCount: tripsViewModel.tagCounts[tag.rawValue] ?? 0, showsBadgeWhenEmpty: true) {
                            tripsViewModel.selectTag(tripsViewModel.selectedTag == tag ? nil : tag)
                        }
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func eventChip(_ label: String, selected: Bool, badge: Int, action: @escaping () -> Void) -> some View {
        Chip(label: label, isSelected: selected, badgeCount: badge, showsBadgeWhenEmpty: true, action: action)
    }
}