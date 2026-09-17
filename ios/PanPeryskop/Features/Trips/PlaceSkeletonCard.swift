import SwiftUI

struct PlaceSkeletonCard: View {
    var width: CGFloat = PlaceCard.width
    var height: CGFloat = PlaceCard.legacyHeight

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SkeletonBlock(height: 92, radius: Theme.Radius.chip)
            SkeletonBlock(width: 140, height: 14)
            SkeletonBlock(width: 90, height: 10)
            SkeletonBlock(width: 70, height: 14)
            SkeletonBlock(width: 120, height: 9)
            SkeletonBlock(width: 160, height: 9)
        }
        .frame(width: width, height: height, alignment: .topLeading)
        .skeletonPulse()
    }
}
