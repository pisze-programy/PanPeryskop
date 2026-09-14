import SwiftUI

/// Loading placeholder for `FlightTimeline`. It reuses the exact day-cell size
/// (56×66) so the section keeps its height while prices load — no jump, no
/// spinner. Fake days pulse softly.
struct FlightTimelineSkeleton: View {
    var cells: Int = 7

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<cells, id: \.self) { _ in
                VStack(spacing: 4) {
                    SkeletonBlock(width: 24, height: 8)
                    SkeletonBlock(width: 34, height: 7)
                    SkeletonBlock(width: 28, height: 8)
                    SkeletonBlock(width: 30, height: 8)
                }
                .frame(width: 56, height: 66)
                .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding(.horizontal, Theme.Spacing.xs)
        .padding(.vertical, Theme.Spacing.xs)
        .skeletonPulse()
        .allowsHitTesting(false)
    }
}
