import SwiftUI

struct CompactShowtimesPager: View {
    let times: [String]
    @Binding var selectedTime: String?
    let onTap: () -> Void

    @State private var page: Int? = 0

    var body: some View {
        VStack(spacing: 5) {
            timesScroller
            indicatorView
        }
        .onChange(of: page) { old, new in
            handlePageChange(old: old, new: new)
        }
        .onChange(of: times) { _, _ in
            resetPageIfOutOfBounds()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(activeTime)
        .accessibilityValue("\(activeIndex + 1) z \(max(times.count, 1))")
    }

    private var activeIndex: Int {
        guard let page, times.indices.contains(page) else { return 0 }
        return page
    }

    private var activeTime: String {
        guard times.indices.contains(activeIndex) else { return "--:--" }
        return times[activeIndex]
    }

    private var timesScroller: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(Array(times.enumerated()), id: \.offset) { index, time in
                    pageItem(index: index, time: time)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $page)
        .frame(height: 29)
    }

    private func pageItem(index: Int, time: String) -> some View {
        CompactFlipClockView(time: time)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
            .onTapGesture {
                Haptics.selection()
                onTap()
            }
            .containerRelativeFrame(.horizontal)
            .id(index)
    }

    @ViewBuilder
    private var indicatorView: some View {
        if times.count <= 8 {
            dotsRow
        } else {
            compactTrack
        }
    }

    private var dotsRow: some View {
        HStack(spacing: 4) {
            ForEach(times.indices, id: \.self) { index in
                Circle()
                    .fill(index == activeIndex ? Color.white : Color.white.opacity(0.38))
                    .frame(width: 5, height: 5)
            }
        }
        .shadow(color: .black.opacity(0.45), radius: 1.5, x: 0, y: 1)
        .allowsHitTesting(false)
    }

    private var compactTrack: some View {
        GeometryReader { geo in
            compactTrackCapsules(width: geo.size.width)
        }
        .frame(height: 4)
        .padding(.horizontal, 10)
        .allowsHitTesting(false)
    }

    private func compactTrackCapsules(width: CGFloat) -> some View {
        let spacing: CGFloat = 3
        let count = max(times.count, 1)
        let totalSpacing = spacing * CGFloat(max(0, count - 1))
        let inactiveWidth = max(1.5, min(5, (width * 0.55 - totalSpacing) / CGFloat(max(1, count - 1))))
        let activeWidth = max(6, width - totalSpacing - inactiveWidth * CGFloat(count - 1))
        return HStack(spacing: spacing) {
            ForEach(times.indices, id: \.self) { index in
                Capsule()
                    .fill(index == activeIndex ? Color.white : Color.white.opacity(0.38))
                    .frame(width: index == activeIndex ? activeWidth : inactiveWidth, height: 4)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func handlePageChange(old: Int?, new: Int?) {
        emitHapticIfChanged(old: old, new: new)
        guard let index = new, times.indices.contains(index) else { return }
        selectedTime = times[index]
    }

    private func emitHapticIfChanged(old: Int?, new: Int?) {
        guard old != new else { return }
        Haptics.impact(.light)
    }

    private func resetPageIfOutOfBounds() {
        guard let current = page, !times.indices.contains(current) else { return }
        page = 0
    }
}
