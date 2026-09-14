import SwiftUI

/// Pulsing opacity for skeleton placeholders.
struct SkeletonPulse: ViewModifier {
    @State private var on = false

    func body(content: Content) -> some View {
        content
            .opacity(on ? 0.45 : 1)
            .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: on)
            .onAppear { on = true }
    }
}

extension View {
    func skeletonPulse() -> some View { modifier(SkeletonPulse()) }
}

/// One grey rounded block used to fake content.
struct SkeletonBlock: View {
    var width: CGFloat? = nil
    var height: CGFloat
    var radius: CGFloat = 4

    var body: some View {
        RoundedRectangle(cornerRadius: radius)
            .fill(Color(.systemGray5))
            .frame(width: width, height: height)
    }
}
