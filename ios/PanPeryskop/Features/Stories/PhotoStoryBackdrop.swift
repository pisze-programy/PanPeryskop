import SwiftUI
import UIKit

/// The background of a photo story card: one bundled photo, treated so the text
/// above it always reads.
///
/// The photo is dark by design — a club interior. It is never inverted for light
/// mode, because a photo cannot be light. The saturation is lowered so the red
/// does not fight the calm palette, and the crop shifts a little per event, so
/// two nights that share the photo do not look identical.
///
/// The name is neutral on purpose: a restaurant card uses the same backdrop.
struct PhotoStoryBackdrop: View {
    /// The seed for the crop shift. The post id gives a stable value.
    let shiftSeed: String

    private static let assetName = "club-night"
    private static let maxShiftFraction: CGFloat = 0.03
    private static let scale: CGFloat = 1.08

    var body: some View {
        ZStack {
            Color.black
            if let image = UIImage(named: Self.assetName, in: .main, compatibleWith: nil) {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .scaleEffect(Self.scale)
                    .saturation(0.6)
                    .offset(y: shift)
                    .clipped()
            }
        }
        .accessibilityHidden(true)
    }

    /// A stable shift inside ±3 per cent of the frame height. A plain hash, so
    /// the value never changes between launches.
    private var shift: CGFloat {
        let sum = shiftSeed.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFFFF }
        let unit = CGFloat(sum % 1000) / 1000 - 0.5
        return unit * 2 * Self.maxShiftFraction * 800
    }
}
