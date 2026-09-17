import SwiftUI
import MapKit
import CoreLocation

struct DestinationMapRail: View {
    let origin: Airport
    let options: [FlightOption]
    let selected: FlightOption?
    let onSelect: (FlightOption) -> Void

    @State private var activeId: String?

    private static let mapHeight: CGFloat = 190

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            GeometryReader { geo in
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 0) {
                        ForEach(options) { option in
                            DestinationMapPage(origin: origin, option: option)
                                .frame(width: geo.size.width)
                                .id(option.id)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.paging)
                .scrollPosition(id: $activeId)
                .scrollDisabled(options.count <= 1)
            }
            .frame(height: Self.mapHeight)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                    .stroke(Theme.Palette.hairline, lineWidth: 0.5)
            )
            .onChange(of: activeId) { _, newValue in
                guard let newValue, let option = options.first(where: { $0.id == newValue }) else { return }
                onSelect(option)
            }
            .onChange(of: selected?.id) { _, newValue in
                guard let newValue, newValue != activeId else { return }
                activeId = newValue
            }
            .onChange(of: options.map(\.id)) { _, _ in
                guard activeId == nil || !options.contains(where: { $0.id == activeId }) else { return }
                activeId = selected?.id ?? options.first?.id
            }
            .onAppear { activeId = selected?.id ?? options.first?.id }

            if options.count > 1 {
                PageDots(count: options.count, index: currentIndex)
            }
        }
    }

    private var currentIndex: Int {
        options.firstIndex { $0.id == (selected?.id ?? activeId) } ?? 0
    }
}
