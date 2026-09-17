import SwiftUI

struct PlacesCardSkeleton: View {
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                ForEach(0..<3, id: \.self) { _ in
                    PlaceSkeletonCard()
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.s)
        }
        .disabled(true)
    }
}
