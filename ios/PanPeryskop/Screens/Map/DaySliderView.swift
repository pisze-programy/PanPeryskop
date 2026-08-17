import SwiftUI

/// Vertical "scroll" day picker for the map (events only). Fully custom, modeled on
/// the CompactSlider scrollable behavior:
///  - the CENTER of the rail is always the selected day (the scale scrolls under it)
///  - ticks for days 0…3; ghost ticks at -1/+4 (opacity 0.5) mark the range edges
///  - a "wall" clamps the wheel at the ends (with its own haptic when pushed past)
///  - a weekday label slides in above the rail while scrubbing, hides on release
///  - idle state = dimmed ticks (opacity 0.5); day persists only in the view model
struct DaySliderView: View {
    @ObservedObject var viewModel: MapViewModel

    private static let spacing: CGFloat = 36
    private static let railHeight: CGFloat = 200
    private static let minDay = 0
    private static let maxDay = 3

    @State private var offset: CGFloat = 0
    @State private var isScrubbing = false
    @State private var dragStartOffset: CGFloat = 0
    @State private var lastTickOffset: CGFloat = 0
    @State private var lastTickIndex = -2

    private var clampedOffset: CGFloat {
        min(max(offset, CGFloat(Self.minDay)), CGFloat(Self.maxDay))
    }
    private var selectedIndex: Int { Int(clampedOffset.rounded()) }
    private var selectedDate: Date {
        Calendar.current.date(byAdding: .day, value: selectedIndex, to: Date()) ?? Date()
    }

    // Calendar.weekday: 1 = Sunday … 7 = Saturday.
    private let weekdayAbbrev = ["Nd", "Pon", "Wt", "Śr", "Czw", "Pt", "Sob"]

    private var weekdayLabel: String {
        weekdayAbbrev[Calendar.current.component(.weekday, from: selectedDate) - 1]
    }

    var body: some View {
        VStack(spacing: 4) {
            label
            wheel
        }
        .onAppear { offset = CGFloat(viewModel.selectedDayOffset) }
    }

    private var label: some View {
        ZStack {
            if isScrubbing {
                Text(weekdayLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.primary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 3)
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .frame(height: 26)
        .animation(.spring(response: 0.28, dampingFraction: 0.8), value: isScrubbing)
    }

    private var wheel: some View {
        GeometryReader { geo in
            let centerY = geo.size.height / 2
            ZStack {
                Capsule()
                    .fill(.ultraThinMaterial)
                    .frame(width: 26, height: geo.size.height)
                    .overlay(Capsule().stroke(.white.opacity(0.2), lineWidth: 1))

                ForEach(Self.minDay - 1...Self.maxDay + 1, id: \.self) { day in
                    tickLine(for: day)
                        .frame(width: tickWidth(for: day), height: 2)
                        .position(
                            x: geo.size.width / 2,
                            y: centerY - (CGFloat(day) - clampedOffset) * Self.spacing
                        )
                }

                // Fixed center marker (the selection).
                Capsule()
                    .fill(Color.primary.opacity(isScrubbing ? 0.95 : 0.7))
                    .frame(width: 16, height: 3)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .frame(width: 44, height: Self.railHeight)
        .contentShape(Rectangle())
        .gesture(drag)
    }

    private func tickWidth(for day: Int) -> CGFloat {
        if day == selectedIndex { return 18 }
        return day < Self.minDay || day > Self.maxDay ? 10 : 14
    }

    private func tickLine(for day: Int) -> some View {
        let ghost = day < Self.minDay || day > Self.maxDay
        let isSelected = day == selectedIndex
        let opacity: Double = ghost ? 0.5 : (isScrubbing ? (isSelected ? 1.0 : 0.75) : 0.5)
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
                    // Dynamic intensity: fast drags (bigger jump) feel stronger.
                    Haptics.sliderTick(intensity: 0.4 + min(0.6, jump * 0.25))
                }
            }
            .onEnded { _ in
                let final = Int(clampedOffset.rounded())
                offset = CGFloat(final)
                isScrubbing = false
                lastTickIndex = -2
                viewModel.commitDay(final)
            }
    }
}
