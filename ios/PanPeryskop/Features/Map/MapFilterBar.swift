import SwiftUI

/// Top filter bar of the map: picker pill (city / airport) + category-appropriate chips.
struct MapFilterBar: View {
    let category: MapCategory
    @ObservedObject var mapViewModel: MapViewModel
    @ObservedObject var tripsViewModel: TripsViewModel
    let onCityTap: () -> Void
    let onAirportTap: () -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.s) {
                switch category {
                case .events, .live:
                    MapPickerPill(title: mapViewModel.selectedCity.name, action: onCityTap)
                    if category == .events {
                        eventChip("Wszystkie", selected: mapViewModel.selectedTag == nil, badge: mapViewModel.tagTotalCount) {
                            mapViewModel.selectAll()
                        }
                        .padding(.leading, 10)
                        ForEach(mapViewModel.sortedTags) { tag in
                            eventChip(tag.label, selected: mapViewModel.selectedTag == tag.id, badge: mapViewModel.tagCounts[tag.id] ?? 0) {
                                mapViewModel.toggleTag(tag.id)
                            }
                        }
                    }
                case .trips:
                    MapPickerPill(
                        title: "\(tripsViewModel.selectedAirport.iata) · \(tripsViewModel.selectedAirport.city)",
                        action: onAirportTap
                    )
                    .padding(.leading, 10)
                    ForEach(TripsViewModel.TravelTag.allCases) { tag in
                        Chip(label: tag.label, isSelected: tripsViewModel.selectedTag == tag) {
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