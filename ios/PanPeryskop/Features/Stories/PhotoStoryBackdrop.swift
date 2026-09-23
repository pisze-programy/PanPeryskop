import SwiftUI
import UIKit

struct PhotoStoryBackdrop: View {
    let assetPath: String
    let shiftSeed: String

    private static let maxShiftFraction: CGFloat = 0.03
    private static let scale: CGFloat = 1.08

    var body: some View {
        ZStack {
            Color.black
            photo
        }
        .accessibilityHidden(true)
    }

    private var photo: some View {
        Image(uiImage: Self.loadPhoto(assetPath) ?? UIImage())
            .resizable()
            .aspectRatio(contentMode: .fill)
            .scaleEffect(Self.scale)
            .saturation(0.6)
            .offset(y: shift)
            .clipped()
    }

    private static func loadPhoto(_ assetPath: String) -> UIImage? {
        guard let url = Bundle.main.url(forResource: assetPath, withExtension: "webp"),
              let image = UIImage(contentsOfFile: url.path) else { return nil }
        return image
    }

    private var shift: CGFloat {
        let sum = shiftSeed.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFFFF }
        let unit = CGFloat(sum % 1000) / 1000 - 0.5
        return unit * 2 * Self.maxShiftFraction * 800
    }
}
