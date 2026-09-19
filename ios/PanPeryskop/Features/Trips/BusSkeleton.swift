import SwiftUI

/// Loading placeholder for the bus card — same rhythm as the rest of the sheet.
struct BusSkeleton: View {
    private static let height: CGFloat = 96

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            SkeletonBlock(width: 140, height: 14)
            SkeletonBlock(width: 200, height: 10)
            SkeletonBlock(width: nil, height: 44)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .skeletonPulse()
        .allowsHitTesting(false)
    }
}
