import SwiftUI

/// Vertical "scroll" rail picker — the mechanics of the day/week slider. The CENTER
/// of the rail is the selected index (the scale scrolls under it); major ticks for
/// minIndex…maxIndex with `minorDivisions` graduations between them. Drag up = next
/// index; release snaps with direction-aware clamp. `label(for:)` renders the value
/// above the rail (weekday for days, "DD.MM – DD.MM" for weeks).
struct RailSliderView: View {
    let minIndex: Int
    let maxIndex: Int
    let minorDivisions: Int
    let currentIndex: Int
    let label: (Int) -> String
    /// Optional label below the wheel ("do DD.MM"); nil = none (day slider).
    var bottomLabel: ((Int) -> String)? = nil
    let onCommit: (Int) -> Void

    @State private var offset: CGFloat = 0
    @State private var isScrubbing = false
    @State private var dragStartOffset: CGFloat = 0
    @State private var lastTickOffset: CGFloat = 0
    @State private var lastTickIndex = -2
    @State private var lastDragDelta: CGFloat = 0
    @State private var lastRawOffset: CGFloat = 0

    private static let spacing: CGFloat = 72
    private static let railHeight: CGFloat = 150

    private var minorSteps: Set<CGFloat> {
        var out = Set<CGFloat>()
        for m in minIndex...(maxIndex - 1) {
            for k in 1...minorDivisions {
                out.insert(CGFloat(m) + CGFloat(k) / CGFloat(minorDivisions + 1))
            }
        }
        return out
    }

    private var clampedOffset: CGFloat {
        min(max(offset, CGFloat(minIndex)), CGFloat(maxIndex))
    }
    private var selectedIndex: Int { Int(clampedOffset.rounded()) }
    private var labelIndex: Int { isScrubbing ? selectedIndex : currentIndex }

    private var majorRange: ClosedRange<Int> { minIndex...maxIndex }
    private var minorPositions: [CGFloat] {
        var out: [CGFloat] = []
        for m in minIndex...(maxIndex - 1) {
            for k in 1...minorDivisions {
                out.append(CGFloat(m) + CGFloat(k) / CGFloat(minorDivisions + 1))
            }
        }
        return out
    }

    var body: some View {
        VStack(spacing: 4) {
            labelView
            wheel
            if let bottomLabel {
                bottomLabelView(bottomLabel)
            }
        }
        .onAppear { offset = CGFloat(currentIndex) }
        .onChange(of: currentIndex) { _, newValue in
            if !isScrubbing { offset = CGFloat(newValue) }
        }
    }

    private func bottomLabelView(_ make: @escaping (Int) -> String) -> some View {
        Text(make(labelIndex))
            .font(.caption.weight(.semibold))
            .foregroundColor(.primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 3)
            .background(.ultraThinMaterial)
            .clipShape(Capsule())
            .frame(height: 26)
            .animation(.spring(response: 0.28, dampingFraction: 0.8), value: labelIndex)
    }

    private var labelView: some View {
        Text(label(labelIndex))
            .font(.caption.weight(.semibold))
            .foregroundColor(.primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 3)
            .background(.ultraThinMaterial)
            .clipShape(Capsule())
            .frame(height: 26)
            .animation(.spring(response: 0.28, dampingFraction: 0.8), value: labelIndex)
    }

    private func y(for pos: CGFloat, centerY: CGFloat) -> CGFloat {
        centerY + (pos - offset) * Self.spacing
    }

    private var wheel: some View {
        GeometryReader { geo in
            let centerY = geo.size.height / 2
            ZStack {
                Capsule()
                    .fill(.ultraThinMaterial)
                    .frame(width: 26, height: geo.size.height)
                    .overlay(Capsule().stroke(.white.opacity(0.2), lineWidth: 1))

                ForEach(minorPositions, id: \.self) { pos in
                    Capsule()
                        .fill(Color.primary.opacity(0.25))
                        .frame(width: 5, height: 1.5)
                        .position(x: geo.size.width / 2, y: y(for: pos, centerY: centerY))
                }

                ForEach(majorRange, id: \.self) { index in
                    majorTick(for: index)
                        .frame(width: tickWidth(for: index), height: 2)
                        .position(x: geo.size.width / 2, y: y(for: CGFloat(index), centerY: centerY))
                }

                Capsule()
                    .fill(Color.primary.opacity(isScrubbing ? 0.95 : 0.7))
                    .frame(width: 16, height: 3)
            }
            .clipped()
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .frame(width: 44, height: Self.railHeight)
        .contentShape(Rectangle())
        .gesture(drag)
    }

    private func tickWidth(for index: Int) -> CGFloat {
        index == selectedIndex ? 18 : 14
    }

    private func majorTick(for index: Int) -> some View {
        let isSelected = index == selectedIndex
        let opacity: Double = isScrubbing ? (isSelected ? 1.0 : 0.8) : 0.5
        return Capsule().fill(Color.primary.opacity(opacity))
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                if !isScrubbing {
                    isScrubbing = true
                    dragStartOffset = clampedOffset
                    lastTickOffset = clampedOffset
                    lastTickIndex = Int(clampedOffset.rounded())
                    lastRawOffset = clampedOffset
                }
                lastDragDelta = value.translation.height
                let raw = dragStartOffset - value.translation.height / Self.spacing
                let clamped = min(max(raw, CGFloat(minIndex)), CGFloat(maxIndex))
                offset = raw

                let prevRaw = lastRawOffset
                lastRawOffset = raw
                let lo = min(prevRaw, raw), hi = max(prevRaw, raw)
                var crossed = 0
                for p in minorSteps where p > lo && p < hi { crossed += 1 }
                if crossed > 0 { Haptics.sliderMinor(steps: crossed) }

                let newIndex = Int(clamped.rounded())
                if raw != clamped {
                    Haptics.sliderWall()
                } else if newIndex != lastTickIndex {
                    let jump = abs(clamped - lastTickOffset)
                    lastTickOffset = clamped
                    lastTickIndex = newIndex
                    Haptics.sliderTick(intensity: 0.9 + min(0.1, jump * 0.3))
                }
            }
            .onEnded { _ in
                let frac = clampedOffset.truncatingRemainder(dividingBy: 1)
                let movingFuture = lastDragDelta < 0
                let finalRaw: Int
                if frac > 0.4, movingFuture {
                    finalRaw = Int(clampedOffset.rounded(.up))
                } else if frac < 0.6, !movingFuture {
                    finalRaw = Int(clampedOffset.rounded(.down))
                } else {
                    finalRaw = Int(clampedOffset.rounded())
                }
                let final = min(max(finalRaw, minIndex), maxIndex)
                offset = CGFloat(final)
                isScrubbing = false
                lastTickIndex = -2
                lastDragDelta = 0
                onCommit(final)
            }
    }
}