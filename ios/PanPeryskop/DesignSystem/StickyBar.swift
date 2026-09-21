import SwiftUI

private enum StickyBarMetrics {
    static let glowRadiusScale: CGFloat = 1.1
    static let glowOffsetFraction: CGFloat = 0.0325
    static let glowCenterY: CGFloat = -0.25
    static let edgeShadowHeight: CGFloat = 5
    static let edgeShadowOpacity: Double = 0.1
}

/// Sticky bar chrome for a sheet's top inset: two corner glows, the bar material,
/// a divider and the top padding that clears the drag indicator. Content is the
/// bar's own row. Shared by the event gamestrip and the city-break header.
struct StickyBar<Content: View>: View {
    let leadingColor: Color
    let trailingColor: Color
    var topPadding: CGFloat = 18
    var bottomPadding: CGFloat = 10
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            content()
                .padding(.top, topPadding)
                .padding(.bottom, bottomPadding)
                .frame(maxWidth: .infinity)
            Divider()
        }
        .background(background)
    }

    private var background: some View {
        GeometryReader { geometry in
            glows(in: geometry.size)
        }
        .overlay(alignment: .bottom) { edgeShadow }
    }

    private func glows(in size: CGSize) -> some View {
        let radius = max(size.width, size.height) * StickyBarMetrics.glowRadiusScale
        let leading = UnitPoint(x: -StickyBarMetrics.glowOffsetFraction, y: StickyBarMetrics.glowCenterY)
        let trailing = UnitPoint(x: 1 + StickyBarMetrics.glowOffsetFraction, y: StickyBarMetrics.glowCenterY)
        return ZStack {
            Rectangle().fill(Color(.systemBackground))
            CornerGlow(color: leadingColor, center: leading, radius: radius)
            CornerGlow(color: trailingColor, center: trailing, radius: radius)
        }
    }

    private var edgeShadow: some View {
        LinearGradient(
            colors: [Color.black.opacity(StickyBarMetrics.edgeShadowOpacity), .clear],
            startPoint: .top,
            endPoint: .bottom
        )
        .frame(height: StickyBarMetrics.edgeShadowHeight)
        .offset(y: StickyBarMetrics.edgeShadowHeight)
    }
}
