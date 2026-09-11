import SwiftUI

/// Standard sheet chrome: detents, drag indicator and material background in one place.
struct SheetShell<Content: View>: View {
    var detents: Set<PresentationDetent> = [.medium, .large]
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .presentationDetents(detents)
            .presentationDragIndicator(.visible)
            .presentationBackground(.regularMaterial)
    }
}