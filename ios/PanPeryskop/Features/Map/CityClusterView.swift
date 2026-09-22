import SwiftUI

/// A band cell that holds several cities: one badge with the count. Tapping it
/// opens the largest city of the group.
struct CityClusterView: View {
    let cluster: CityCluster
    var scale: CGFloat = 1

    private static let diameter: CGFloat = 40

    var body: some View {
        ZStack {
            Circle().fill(Color.black.opacity(0.25))
            Circle().fill(Color.accentColor)
            Text("\(cluster.count)")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.white)
        }
        .frame(width: Self.diameter, height: Self.diameter)
        .scaleEffect(scale)
        .transition(.scale.combined(with: .opacity))
    }
}
