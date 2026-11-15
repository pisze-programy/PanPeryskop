import SwiftUI

struct EuropaGamestripCard<Content: View>: View {
    let leadingColor: Color
    let trailingColor: Color
    var leadingCity: TravelCity? = nil
    @ViewBuilder let content: () -> Content

    private static var leadingPhotoWidth: CGFloat { 78 }
    private static var leadingPhotoOpacity: Double { 0.62 }
    private static var leadingPhotoFadeStart: CGFloat { 0.45 }
    private static var glowRadiusScale: CGFloat { 1.1 }
    private static var glowOffsetFraction: CGFloat { 0.0325 }
    private static var glowCenterY: CGFloat { -0.25 }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background { cardBackground }
            .clipShape(shape)
            .overlay(shape.stroke(Color.primary.opacity(0.08), lineWidth: 0.5))
            .contentShape(shape)
    }

    private var cardBackground: some View {
        ZStack(alignment: .leading) {
            Color(.secondarySystemGroupedBackground)
            leadingCityPhoto
            glowLayer
        }
    }

    @ViewBuilder
    private var leadingCityPhoto: some View {
        if let leadingCity {
            Color.clear
                .frame(width: Self.leadingPhotoWidth)
                .overlay {
                    GeometryReader { proxy in
                        CityPhoto(city: leadingCity, showsPlaceholder: false)
                            .frame(width: proxy.size.width, height: proxy.size.height)
                    }
                }
                .clipped()
                .opacity(Self.leadingPhotoOpacity)
                .mask(leadingPhotoFade)
                .allowsHitTesting(false)
        }
    }

    private var leadingPhotoFade: LinearGradient {
        LinearGradient(
            stops: [
                .init(color: .black, location: 0),
                .init(color: .black, location: Self.leadingPhotoFadeStart),
                .init(color: .clear, location: 1),
            ],
            startPoint: .leading,
            endPoint: .trailing
        )
    }

    private var glowLayer: some View {
        GeometryReader { proxy in
            let radius = max(proxy.size.width, proxy.size.height) * Self.glowRadiusScale
            ZStack {
                CornerGlow(
                    color: leadingColor,
                    center: UnitPoint(x: -Self.glowOffsetFraction, y: Self.glowCenterY),
                    radius: radius
                )
                CornerGlow(
                    color: trailingColor,
                    center: UnitPoint(x: 1 + Self.glowOffsetFraction, y: Self.glowCenterY),
                    radius: radius
                )
            }
        }
        .allowsHitTesting(false)
    }
}
