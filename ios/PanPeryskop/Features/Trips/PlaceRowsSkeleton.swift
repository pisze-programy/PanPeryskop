import SwiftUI

struct PlaceRowsSkeleton: View {
    var body: some View {
        LazyVStack(spacing: Theme.Spacing.l) {
            ForEach(0..<4, id: \.self) { _ in
                PlaceRowSkeleton()
            }
        }
    }
}
