import SwiftUI

struct PlaceRowSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            SkeletonBlock(width: 160, height: 16)
            SkeletonBlock(width: 90, height: 11)
            SkeletonBlock(width: 70, height: 14)
            SkeletonBlock(width: 130, height: 10)
            SkeletonBlock(height: 180, radius: Theme.Radius.chip)
        }
        .padding(Theme.Spacing.m)
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
        .skeletonPulse()
    }
}
