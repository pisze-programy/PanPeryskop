import SwiftUI

struct ProgressBar: View {
    let fraction: Double
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.3))
                Capsule().fill(Color.white).frame(width: geo.size.width * fraction)
            }
        }
        .frame(height: 3)
    }
}

struct StoryBlurBar: View {
    let bottomFade: Bool

    var body: some View {
        ZStack {
            Rectangle().fill(Color.black.opacity(0.25))
            Rectangle().fill(.ultraThinMaterial)
        }
        .mask(
            LinearGradient(
                colors: [Color.black, Color.clear],
                startPoint: bottomFade ? .top : .bottom,
                endPoint: bottomFade ? .bottom : .top
            )
        )
        .allowsHitTesting(false)
    }
}

struct FlipClockTime: View {
    let time: String

    var body: some View {
        HStack(spacing: 5) {
            FlipClockDigit(text: String(time.prefix(1)))
            FlipClockDigit(text: String(time.dropFirst(1).prefix(1)))
            colon
            FlipClockDigit(text: String(time.dropFirst(3).prefix(1)))
            FlipClockDigit(text: String(time.suffix(1)))
        }
    }

    private var colon: some View {
        VStack(spacing: 7) {
            Circle().fill(Color(red: 0.12, green: 0.13, blue: 0.15)).frame(width: 5, height: 5)
            Circle().fill(Color(red: 0.12, green: 0.13, blue: 0.15)).frame(width: 5, height: 5)
        }
        .padding(.horizontal, 2)
    }
}

struct FlipClockDigit: View {
    let text: String

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color(red: 0.12, green: 0.13, blue: 0.15))
            VStack(spacing: 0) {
                Rectangle()
                    .fill(Color.white.opacity(0.07))
                Rectangle()
                    .fill(Color.black.opacity(0.5))
                    .frame(height: 1)
                Rectangle()
                    .fill(Color.black.opacity(0.18))
            }
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            Text(text)
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundColor(.white)
        }
        .frame(width: 30, height: 50)
    }
}

struct ShowtimesPager: View {
    let times: [String]
    var onInteraction: (Bool) -> Void = { _ in }
    var onSelect: (String) -> Void = { _ in }
    @State private var page: Int?
    @State private var isInteracting = false
    @GestureState private var isDragging = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            timesScroller
            indicatorTrack
        }
        .onChange(of: isDragging) { _, dragging in
            setInteracting(dragging)
        }
        .onChange(of: page) { old, new in
            handlePageChange(old: old, new: new)
        }
        .onDisappear {
            setInteracting(false)
        }
    }

    private var timesScroller: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(Array(times.enumerated()), id: \.offset) { _, time in
                    FlipClockTime(time: time)
                        .containerRelativeFrame(.horizontal)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $page)
        .frame(height: 50)
        .simultaneousGesture(
            DragGesture(minimumDistance: 1)
                .updating($isDragging) { _, state, _ in
                    state = true
                }
        )
    }

    private var indicatorTrack: some View {
        GeometryReader { geo in
            indicatorRow(width: geo.size.width)
        }
        .frame(height: 4)
    }

    private func indicatorRow(width: CGFloat) -> some View {
        let spacing: CGFloat = 4
        let n = max(times.count, 1)
        let many = n > 8
        let totalSpacing = spacing * CGFloat(max(0, n - 1))
        let inactiveW: CGFloat = many
            ? max(1.5, min(6, (width / 2 - totalSpacing) / CGFloat(max(1, n - 1))))
            : 0
        let activeW: CGFloat = many
            ? max(0, width - totalSpacing - inactiveW * CGFloat(n - 1))
            : 0
        return HStack(spacing: spacing) {
            ForEach(times.indices, id: \.self) { index in
                indicatorCapsule(active: index == (page ?? 0), many: many, activeW: activeW, inactiveW: inactiveW)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func indicatorCapsule(active: Bool, many: Bool, activeW: CGFloat, inactiveW: CGFloat) -> some View {
        Capsule()
            .fill(active ? Color.blue : Color.secondary.opacity(0.3))
            .frame(width: many ? (active ? activeW : inactiveW) : nil)
            .frame(maxWidth: many ? nil : .infinity)
    }

    private func setInteracting(_ interacting: Bool) {
        guard isInteracting != interacting else { return }
        isInteracting = interacting
        onInteraction(interacting)
    }

    private func handlePageChange(old: Int?, new: Int?) {
        if old != new { Haptics.impact(.light) }
        guard let idx = new, idx < times.count else { return }
        onSelect(times[idx])
    }
}
