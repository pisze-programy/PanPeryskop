import SwiftUI

private enum StickyBarMetrics {
    static let glowRadiusScale: CGFloat = 1.1
    static let glowOffsetFraction: CGFloat = 0.0325
    static let glowCenterY: CGFloat = -0.25
    static let edgeShadowHeight: CGFloat = 5
    static let edgeShadowOpacity: Double = 0.1
    static let imageWidth: CGFloat = 64
    static let imageOpacity: Double = 0.6
    static let imageFadeStart: CGFloat = 0.5
}

/// Sticky bar chrome for a sheet's top inset: the bar material, two corner glows,
/// an optional leading image, a divider and the top padding that clears the drag
/// indicator. Content is the bar's own row. Shared by the event gamestrip and the
/// city-break header.
struct StickyBar<Content: View>: View {
    let leadingColor: Color
    let trailingColor: Color
    /// Fills the leading edge, behind the colour wash. The content is inset past it.
    var leadingImage: URL? = nil
    var topPadding: CGFloat = 18
    var bottomPadding: CGFloat = 10
    @ViewBuilder var content: () -> Content

    private var leadingInset: CGFloat {
        leadingImage == nil ? Theme.Spacing.l : StickyBarMetrics.imageWidth + Theme.Spacing.s
    }

    var body: some View {
        VStack(spacing: 0) {
            content()
                .padding(.leading, leadingInset)
                .padding(.trailing, Theme.Spacing.l)
                .padding(.top, topPadding)
                .padding(.bottom, bottomPadding)
                .frame(maxWidth: .infinity)
            Divider()
        }
        .background(background)
    }

    private var background: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Rectangle().fill(Color(.systemBackground))
                if let leadingImage {
                    imageLayer(leadingImage, height: geometry.size.height)
                }
                glows(in: geometry.size)
            }
        }
        .overlay(alignment: .bottom) { edgeShadow }
    }

    private func imageLayer(_ url: URL, height: CGFloat) -> some View {
        AsyncImage(url: url) { image in
            image.resizable().aspectRatio(contentMode: .fill)
        } placeholder: {
            Color.clear
        }
        .frame(width: StickyBarMetrics.imageWidth, height: height)
        .clipped()
        .opacity(StickyBarMetrics.imageOpacity)
        .mask(
            LinearGradient(
                stops: [
                    .init(color: .black, location: 0),
                    .init(color: .black, location: StickyBarMetrics.imageFadeStart),
                    .init(color: .clear, location: 1),
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
    }

    private func glows(in size: CGSize) -> some View {
        let radius = max(size.width, size.height) * StickyBarMetrics.glowRadiusScale
        let leading = UnitPoint(x: -StickyBarMetrics.glowOffsetFraction, y: StickyBarMetrics.glowCenterY)
        let trailing = UnitPoint(x: 1 + StickyBarMetrics.glowOffsetFraction, y: StickyBarMetrics.glowCenterY)
        return ZStack {
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
