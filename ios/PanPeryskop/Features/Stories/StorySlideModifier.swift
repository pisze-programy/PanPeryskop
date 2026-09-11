import SwiftUI

/// Simple horizontal slide for the story media — the current page slides out to
/// the edge, the new one slides in from the opposite edge (left/right).
struct StorySlideModifier: ViewModifier {
    let offset: CGFloat

    func body(content: Content) -> some View {
        content
            .offset(x: offset)
            .shadow(color: .black.opacity(abs(offset) > 1 ? 0.25 : 0), radius: 12)
    }
}
