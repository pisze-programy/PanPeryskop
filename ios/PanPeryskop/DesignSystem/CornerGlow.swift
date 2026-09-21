import SwiftUI

/// Soft corner wash behind a sticky bar. Two of them (leading and trailing) give
/// the bar a gradient without hiding the content.
struct CornerGlow: View {
    let color: Color
    let center: UnitPoint
    let radius: CGFloat

    private static let opacity: Double = 0.5
    private static let fadeLocation: Double = 0.65

    var body: some View {
        RadialGradient(
            stops: [
                .init(color: color.opacity(Self.opacity), location: 0),
                .init(color: .clear, location: Self.fadeLocation),
            ],
            center: center,
            startRadius: 0,
            endRadius: radius
        )
    }
}
