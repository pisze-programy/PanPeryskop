import SwiftUI

/// Vertical "scroll" day picker for the map (events only). Fully custom, modeled on
/// the CompactSlider scrollable behavior:
///  - the CENTER of the rail is always the selected day (the scale scrolls under it)
///  - major ticks for days 0…3 (no ghost ticks — the rail is empty before/after the
///    range) with 3 minor graduations between every day
///  - generous pixels-per-day so a day change needs real drag distance (no "falling"
///    into the next day), and a "wall" clamps at the ends with its own haptic
///  - down = back to today (top), up = next days; release snaps with direction-aware clamp
///  - the weekday label (Pon..Nd) is ALWAYS visible above the rail
///  - dynamic tick haptics (single reused generator + throttle, iOS-safe) + wall haptic
struct DaySliderView: View {
    @ObservedObject var viewModel: MapViewModel

    private static let spacing: CGFloat = 72
    private static let railHeight: CGFloat = 150
    private static let minDay = 0
    private static let maxDay = 3
    private static let minorDivisions = 3      // sub-steps between major days

    @State private var offset: CGFloat = 0
    @State private var isScrubbing = false
    @State private var dragStartOffset: CGFloat = 0
    @State private var lastTickOffset: CGFloat = 0
    @State private var lastTickIndex = -2
    @State private var lastDragDelta: CGFloat = 0

    private var clampedOffset: CGFloat {
        min(max(offset, CGFloat(Self.minDay)), CGFloat(Self.maxDay))
    }
    private var selectedIndex: Int { Int(clampedOffset.rounded()) }
    private var labelIndex: Int { isScrubbing ? selectedIndex : viewModel.selectedDayOffset }

    private var selectedDate: Date {
        Calendar.current.date(byAdding: .day, value: labelIndex, to: Date()) ?? Date()
    }
    // Calendar.weekday: 1 = Sunday … 7 = Saturday.
    private let weekdayAbbrev = ["Nd", "Pon", "Wt", "Śr", "Czw", "Pt", "Sob"]
    private var weekdayLabel: String {
        weekdayAbbrev[Calendar.current.component(.weekday, from: selectedDate) - 1]
    }

    private var majorRange: ClosedRange<Int> { Self.minDay...Self.maxDay }
    // Minor graduations between each adjacent major tick (skipping the majors).
    private var minorPositions: [CGFloat] {
        var out: [CGFloat] = []
        let majors = Self.minDay...(Self.maxDay - 1)
        for m in majors {
            for k in 1...Self.minorDivisions {
                out.append(CGFloat(m) + CGFloat(k) / CGFloat(Self.minorDivisions + 1))
            }
        }
        return out
    }

    var body: some View {
        VStack(spacing: 4) {
            label
            wheel
        }
        .onAppear { offset = CGFloat(viewModel.selectedDayOffset) }
    }

    private var label: some View {
        Text(weekdayLabel)
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
        // Down = next days: future (pos > selection) renders below the center.
        centerY + (pos - clampedOffset) * Self.spacing
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

                ForEach(majorRange, id: \.self) { day in
                    majorTick(for: day)
                        .frame(width: tickWidth(for: day), height: 2)
                        .position(x: geo.size.width / 2, y: y(for: CGFloat(day), centerY: centerY))
                }

                // Fixed center marker (the selection).
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

    private func tickWidth(for day: Int) -> CGFloat {
        day == selectedIndex ? 18 : 14
    }

    private func majorTick(for day: Int) -> some View {
        let isSelected = day == selectedIndex
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
                }
                lastDragDelta = value.translation.height
                // Natural scroll: dragging UP (finger up) → next days; DOWN → back to today.
                let raw = dragStartOffset - value.translation.height / Self.spacing
                let clamped = min(max(raw, CGFloat(Self.minDay)), CGFloat(Self.maxDay))
                offset = clamped
                let newIndex = Int(clamped.rounded())
                if raw != clamped {
                    // Pushed past a wall — boundary haptic (throttled inside Haptics).
                    Haptics.sliderWall()
                } else if newIndex != lastTickIndex {
                    let jump = abs(clamped - lastTickOffset)
                    lastTickOffset = clamped
                    lastTickIndex = newIndex
                    Haptics.sliderTick(intensity: 0.4 + min(0.6, jump * 0.25))
                }
            }
            .onEnded { _ in
                // Direction-aware snap: when the finger is still moving, bias the
                // rounding toward that direction (future = drag up = negative delta).
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
                let final = min(max(finalRaw, Self.minDay), Self.maxDay)
                offset = CGFloat(final)
                isScrubbing = false
                lastTickIndex = -2
                lastDragDelta = 0
                viewModel.commitDay(final)
            }
    }
}
