import SwiftUI

/// One grey day slot while a flight month loads. The highlight walks the cell
/// with a per-cell delay and speed, so a loaded grid reads as scattered activity
/// rather than one synchronised pulse.
struct SkeletonDayCell: View {
    let index: Int
    let height: CGFloat
    let radius: CGFloat

    @State private var phase: Double = 0

    private static let baseDuration: Double = 1.1
    private static let durationSpread: Double = 0.7
    private static let maxDelay: Double = 0.8
    private static let highlightOpacity: Double = 0.14

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(Color(.systemGray5))
            .frame(maxWidth: .infinity, minHeight: height)
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [.clear, Color.primary.opacity(Self.highlightOpacity), .clear],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .opacity(phase)
            )
            .onAppear {
                withAnimation(
                    .easeInOut(duration: duration)
                        .repeatForever(autoreverses: true)
                        .delay(delay)
                ) {
                    phase = 1
                }
            }
    }

    private var duration: Double {
        Self.baseDuration + Self.durationSpread * fraction(seed: 17)
    }

    private var delay: Double {
        Self.maxDelay * fraction(seed: 31)
    }

    private func fraction(seed: Int) -> Double {
        let mixed = (index &* seed &+ seed) % 100
        return Double(mixed) / 100
    }
}
