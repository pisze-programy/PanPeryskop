import SwiftUI

struct RunStoryBand: View {
    let title: String
    let distance: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            distancePill
            Text(title)
                .font(.title2.weight(.bold))
                .foregroundColor(.white)
                .multilineTextAlignment(.leading)
                .lineLimit(3)
                .minimumScaleFactor(0.7)
                .shadow(color: .black.opacity(0.4), radius: 10, y: 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, Theme.Spacing.xl)
        .padding(.horizontal, Theme.Spacing.section)
        .background(PhotoStoryBandBackground())
        .compositingGroup()
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var distancePill: some View {
        if let distance {
            Text(distance.uppercased())
                .font(.caption.weight(.bold))
                .tracking(1.6)
                .foregroundColor(.black)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Capsule().fill(.white))
        }
    }
}
