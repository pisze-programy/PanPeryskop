import SwiftUI

/// Rounded surface used for cards and panels (material or solid fill, optional hairline).
struct SurfaceCard<Content: View>: View {
    var cornerRadius: CGFloat = Theme.Radius.sheet
    var fill: AnyShapeStyle = AnyShapeStyle(.ultraThinMaterial)
    var stroke: Color? = Theme.Palette.hairline
    var padding: CGFloat = Theme.Spacing.l
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fill, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay {
                if let stroke {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .stroke(stroke, lineWidth: 0.5)
                }
            }
    }
}