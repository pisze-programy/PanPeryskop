import SwiftUI
import MapKit
import CoreLocation

struct DestinationMapRail: View {
    let origin: Airport
    let options: [FlightOption]
    let selected: FlightOption?
    let onSelect: (FlightOption) -> Void

    @State private var activeId: String?
    /// True while the rail sets its own position, so a programmatic move never
    /// echoes back as a user selection and starts a select/sync loop.
    @State private var isSyncing = false

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
                guard !isSyncing, let newValue, let option = options.first(where: { $0.id == newValue }) else { return }
                onSelect(option)
            }
            .onChange(of: selected?.id) { _, newValue in
                guard let newValue, newValue != activeId else { return }
                setActive(newValue)
            }
            .onChange(of: options.map(\.id)) { _, _ in
                guard activeId == nil || !options.contains(where: { $0.id == activeId }) else { return }
                setActive(selected?.id ?? options.first?.id)
            }
            .onAppear { setActive(selected?.id ?? options.first?.id) }
        }
    }

    var currentIndex: Int {
        options.firstIndex { $0.id == (selected?.id ?? activeId) } ?? 0
    }

    private func setActive(_ id: String?) {
        isSyncing = true
        activeId = id
        DispatchQueue.main.async { isSyncing = false }
    }
}
