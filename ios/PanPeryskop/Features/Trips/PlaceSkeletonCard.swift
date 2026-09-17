import SwiftUI

struct PlaceSkeletonCard: View {
    var width: CGFloat = PlaceCard.width
    var height: CGFloat = PlaceCard.height

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SkeletonBlock(height: 133, radius: Theme.Radius.chip)
            SkeletonBlock(width: 150, height: 16)
            SkeletonBlock(width: 110, height: 11)
            SkeletonBlock(width: 90, height: 11)
            Spacer(minLength: 0)
            SkeletonBlock(width: 70, height: 16)
        }
        .frame(width: width, height: height, alignment: .topLeading)
        .skeletonPulse()
    }
}
