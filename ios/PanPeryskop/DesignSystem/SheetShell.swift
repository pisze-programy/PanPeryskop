import SwiftUI

struct SheetShell<Content: View>: View {
    @Binding var detent: PresentationDetent
    var detents: Set<PresentationDetent> = [.medium, .large]
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .presentationDetents(detents, selection: $detent)
            .presentationDragIndicator(.visible)
            .presentationBackground(.regularMaterial)
    }
}
