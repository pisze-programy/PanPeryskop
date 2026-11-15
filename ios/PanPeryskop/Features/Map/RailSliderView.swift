import SwiftUI

struct RailSliderView: View {
    let minIndex: Int
    let maxIndex: Int
    let minorDivisions: Int
    let currentIndex: Int
    let label: (Int) -> String
    var bottomLabel: ((Int) -> String)? = nil
    let onCommit: (Int) -> Void

    @State private var offset: CGFloat = 0
    @State private var isScrubbing = false
    @State private var dragStartOffset: CGFloat = 0
    @State private var lastTickOffset: CGFloat = 0
    @State private var lastTickIndex = -2
    @State private var lastDragDelta: CGFloat = 0
    @State private var lastRawOffset: CGFloat = 0
    @State private var isPastWall = false

    private static let spacing: CGFloat = 72
    private static let railHeight: CGFloat = 150

    private var upperBound: Int { max(minIndex, maxIndex) }

    private var clampedOffset: CGFloat {
        min(max(offset, CGFloat(minIndex)), CGFloat(upperBound))
    }
    private var selectedIndex: Int { Int(clampedOffset.rounded()) }
    private var labelIndex: Int { isScrubbing ? selectedIndex : currentIndex }

    private var majorRange: ClosedRange<Int> { minIndex...upperBound }
    private var minorPositions: [CGFloat] {
        guard upperBound > minIndex, minorDivisions > 0 else { return [] }
        return (minIndex..<upperBound).flatMap { major in
            (1...minorDivisions).map { step in
                CGFloat(major) + CGFloat(step) / CGFloat(minorDivisions + 1)
            }
        }
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
            syncOffset(to: newValue)
        }
    }

    private func syncOffset(to newValue: Int) {
        guard !isScrubbing else { return }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) {
            offset = CGFloat(newValue)
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
            .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
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
            .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)
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
                    .fill(.regularMaterial)
                    .frame(width: 34, height: geo.size.height)
                    .overlay(Capsule().stroke(.white.opacity(0.25), lineWidth: 1))
                    .shadow(color: .black.opacity(0.18), radius: 8, x: 0, y: 3)

                ForEach(minorPositions, id: \.self) { pos in
                    Capsule()
                        .fill(Color.primary.opacity(0.25))
                        .frame(width: 6, height: 1.5)
                        .position(x: geo.size.width / 2, y: y(for: pos, centerY: centerY))
                }

                ForEach(majorRange, id: \.self) { index in
                    majorTick(for: index)
                        .frame(width: tickWidth(for: index), height: 2)
                        .position(x: geo.size.width / 2, y: y(for: CGFloat(index), centerY: centerY))
                }

                Capsule()
                    .fill(Color.primary.opacity(isScrubbing ? 0.95 : 0.7))
                    .frame(width: 20, height: 3)
            }
            .clipped()
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .frame(width: 52, height: Self.railHeight)
        .contentShape(Rectangle())
        .gesture(drag)
    }

    private func tickWidth(for index: Int) -> CGFloat {
        index == selectedIndex ? 20 : 16
    }

    private func majorTick(for index: Int) -> some View {
        let isSelected = index == selectedIndex
        let opacity: Double = isScrubbing ? (isSelected ? 1.0 : 0.8) : 0.5
        return Capsule().fill(Color.primary.opacity(opacity))
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                handleDragChanged(value)
            }
            .onEnded { _ in
                handleDragEnded()
            }
    }

    private func handleDragChanged(_ value: DragGesture.Value) {
        beginScrubbingIfNeeded()
        lastDragDelta = value.translation.height
        let raw = dragStartOffset - value.translation.height / Self.spacing
        let clamped = min(max(raw, CGFloat(minIndex)), CGFloat(upperBound))
        offset = raw

        let prevRaw = lastRawOffset
        lastRawOffset = raw
        let crossed = crossedMinorCount(from: min(prevRaw, raw), to: max(prevRaw, raw))
        if crossed > 0 {
            Haptics.sliderMinor(steps: crossed)
        }
        handleTickHaptics(raw: raw, clamped: clamped)
    }

    private func beginScrubbingIfNeeded() {
        guard !isScrubbing else { return }
        isScrubbing = true
        isPastWall = false
        dragStartOffset = clampedOffset
        lastTickOffset = clampedOffset
        lastTickIndex = Int(clampedOffset.rounded())
        lastRawOffset = clampedOffset
    }

    private func handleTickHaptics(raw: CGFloat, clamped: CGFloat) {
        guard raw == clamped else {
            triggerWallHapticIfNeeded()
            return
        }
        isPastWall = false
        let newIndex = Int(clamped.rounded())
        guard newIndex != lastTickIndex else { return }
        let jump = abs(clamped - lastTickOffset)
        lastTickOffset = clamped
        lastTickIndex = newIndex
        Haptics.sliderTick(intensity: 0.9 + min(0.1, jump * 0.3))
    }

    private func triggerWallHapticIfNeeded() {
        guard !isPastWall else { return }
        isPastWall = true
        Haptics.sliderWall()
    }

    private func crossedMinorCount(from lo: CGFloat, to hi: CGFloat) -> Int {
        guard upperBound > minIndex, minorDivisions > 0 else { return 0 }
        let a = max(lo, CGFloat(minIndex)) - CGFloat(minIndex)
        let b = min(hi, CGFloat(upperBound)) - CGFloat(minIndex)
        guard b > a else { return 0 }
        let divisions = minorDivisions + 1
        let scale = CGFloat(divisions)
        let first = Int(floor(a * scale)) + 1
        let last = Int(ceil(b * scale)) - 1
        guard last >= first else { return 0 }
        let multiples = (last / divisions) - ((first - 1) / divisions)
        return max(0, (last - first + 1) - multiples)
    }

    private func handleDragEnded() {
        let final = snappedFinalIndex()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) {
            offset = CGFloat(final)
        }
        isScrubbing = false
        isPastWall = false
        lastTickIndex = -2
        lastDragDelta = 0
        onCommit(final)
    }

    private func snappedFinalIndex() -> Int {
        let frac = clampedOffset.truncatingRemainder(dividingBy: 1)
        let movingFuture = lastDragDelta < 0
        let raw: Int
        if frac > 0.4, movingFuture {
            raw = Int(clampedOffset.rounded(.up))
        } else if frac < 0.6, !movingFuture {
            raw = Int(clampedOffset.rounded(.down))
        } else {
            raw = Int(clampedOffset.rounded())
        }
        return min(max(raw, minIndex), upperBound)
    }
}