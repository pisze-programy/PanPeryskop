import SwiftUI

/// A city that is not promoted to a pin: one circle, one stroke. No image, no
/// shadow, no animation modifier — a dot must stay cheap when a hundred are on
/// screen. It stays on the map instead of vanishing, so panning never jumps.
struct CityDotView: View {
    let city: TravelCity
    var scale: CGFloat = 1

    private static let diameter: CGFloat = 8
    private static let touchTarget: CGFloat = 44

    private var accent: Color { CityPalette.base(countryCode: city.countryCode) }

    var body: some View {
        Circle()
            .fill(accent)
            .frame(width: Self.diameter, height: Self.diameter)
            .overlay(Circle().stroke(.white, lineWidth: 1.5))
            .scaleEffect(scale)
            .frame(width: Self.touchTarget, height: Self.touchTarget)
            .contentShape(Circle())
            .transition(.scale.combined(with: .opacity))
    }
}
