import SwiftUI

/// Loading placeholder for the bus card — same shape as the loaded rows, so the
/// section does not jump when the offers arrive.
struct BusSkeleton: View {
    private static let rows = 3

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            ForEach(0..<Self.rows, id: \.self) { _ in
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
                    SkeletonBlock(width: 40, height: 14)
                    VStack(alignment: .leading, spacing: 4) {
                        SkeletonBlock(width: 90, height: 9)
                        SkeletonBlock(width: 70, height: 9)
                    }
                    Spacer(minLength: 0)
                    SkeletonBlock(width: 54, height: 14)
                }
            }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        .skeletonPulse()
        .allowsHitTesting(false)
    }
}
