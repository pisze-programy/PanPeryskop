import SwiftUI

/// The centre band of a photo story card. It carries the identity of the night
/// over the photo: the club and the lineup.
///
/// The band sits on the brightest part of a club photo — the lasers and the
/// smoke. A material alone does not hold the text there, so a black layer sits
/// under it. The mask softens both edges, so the band never looks like a sticker.
///
/// The name is neutral on purpose: a restaurant card uses the same band.
struct PhotoStoryBand: View {
    /// The small line above the hero. Nil hides it.
    let kicker: String?
    /// The hero line — the one loud text on the card.
    let hero: String
    /// The line below the hero. Nil hides it.
    let caption: String?

    private static let minHeightFraction: CGFloat = 0.30
    private static let tintOpacity: Double = 0.30
    private static let kickerOpacity: Double = 0.72
    private static let captionOpacity: Double = 0.70
    private static let ruleWidth: CGFloat = 24
    private static let ruleHeight: CGFloat = 2

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            kickerLine
            rule
            Text(hero)
                .font(.title3.weight(.bold))
                .tracking(-0.2)
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
                .lineLimit(3)
                .minimumScaleFactor(0.75)
            captionLine
        }
        .padding(.vertical, Theme.Spacing.l)
        .padding(.horizontal, Theme.Spacing.section)
        .frame(maxWidth: .infinity)
        .background(band)
        .compositingGroup()
    }

    @ViewBuilder
    private var kickerLine: some View {
        if let kicker {
            Text(kicker.uppercased())
                .font(.caption2.weight(.semibold))
                .tracking(1.6)
                .foregroundColor(.white.opacity(Self.kickerOpacity))
                .lineLimit(1)
        }
    }

    private var rule: some View {
        Capsule()
            .fill(Color.white.opacity(Self.captionOpacity))
            .frame(width: Self.ruleWidth, height: Self.ruleHeight)
    }

    @ViewBuilder
    private var captionLine: some View {
        if let caption {
            Text(caption)
                .font(.footnote)
                .foregroundColor(.white.opacity(Self.captionOpacity))
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
    }

    private var band: some View {
        ZStack {
            Rectangle().fill(.black.opacity(Self.tintOpacity))
            Rectangle().fill(.thinMaterial)
        }
        .mask(
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0),
                    .init(color: .black, location: 0.12),
                    .init(color: .black, location: 0.88),
                    .init(color: .clear, location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }
}
