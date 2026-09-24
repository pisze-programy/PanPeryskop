import SwiftUI

struct PhotoStoryBand: View {
    let kicker: String?
    let hero: String
    let caption: String?

    private static let kickerOpacity: Double = 0.80
    private static let captionOpacity: Double = 0.75
    private static let ruleWidth: CGFloat = 28
    private static let ruleHeight: CGFloat = 2

    var body: some View {
        VStack(spacing: Theme.Spacing.m) {
            kickerLine
            rule
            heroLine
            captionLine
        }
        .padding(.vertical, Theme.Spacing.xl)
        .padding(.horizontal, Theme.Spacing.section)
        .frame(maxWidth: .infinity)
        .background(PhotoStoryBandBackground())
        .compositingGroup()
    }

    @ViewBuilder
    private var kickerLine: some View {
        if let kicker {
            Text(kicker.uppercased())
                .font(.caption2.weight(.semibold))
                .tracking(2)
                .foregroundColor(.white.opacity(Self.kickerOpacity))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    private var rule: some View {
        Capsule()
            .fill(Color.white.opacity(Self.captionOpacity))
            .frame(width: Self.ruleWidth, height: Self.ruleHeight)
    }

    private var heroLine: some View {
        Text(hero)
            .font(.title3.weight(.bold))
            .tracking(-0.2)
            .foregroundColor(.white)
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .minimumScaleFactor(0.7)
            .shadow(color: .black.opacity(0.4), radius: 10, y: 2)
    }

    @ViewBuilder
    private var captionLine: some View {
        if let caption {
            Text(caption)
                .font(.footnote.weight(.medium))
                .foregroundColor(.white.opacity(Self.captionOpacity))
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .shadow(color: .black.opacity(0.35), radius: 8, y: 1)
        }
    }

}
