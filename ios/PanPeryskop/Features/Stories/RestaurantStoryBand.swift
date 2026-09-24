import SwiftUI

struct RestaurantStoryBand: View {
    let name: String
    let award: String?
    let stars: Int
    let cuisine: String
    let topPadding: CGFloat

    private static let gold = Color(red: 0.85, green: 0.71, blue: 0.36)

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            awardLine
            Text(name)
                .font(.system(.title, design: .serif).weight(.semibold))
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .shadow(color: .black.opacity(0.45), radius: 12, y: 2)
            cuisineLine
        }
        .padding(.top, topPadding)
        .padding(.bottom, Theme.Spacing.xl)
        .padding(.horizontal, Theme.Spacing.section)
        .frame(maxWidth: .infinity)
        .background(PhotoStoryBandBackground(tintOpacity: 0.5, strongAtTop: true))
        .compositingGroup()
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var awardLine: some View {
        if stars > 0 {
            HStack(spacing: 6) {
                ForEach(0..<stars, id: \.self) { _ in
                    Image(systemName: "star.fill")
                        .font(.subheadline)
                        .foregroundColor(Self.gold)
                }
            }
            .shadow(color: .black.opacity(0.4), radius: 8, y: 1)
        } else if let award {
            Label(award, systemImage: "fork.knife")
                .font(.caption.weight(.semibold))
                .tracking(1.6)
                .foregroundColor(Self.gold)
        }
    }

    @ViewBuilder
    private var cuisineLine: some View {
        if !cuisine.isEmpty {
            Text(cuisine.uppercased())
                .font(.caption.weight(.semibold))
                .tracking(2)
                .foregroundColor(.white.opacity(0.82))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .shadow(color: .black.opacity(0.35), radius: 8, y: 1)
        }
    }
}
