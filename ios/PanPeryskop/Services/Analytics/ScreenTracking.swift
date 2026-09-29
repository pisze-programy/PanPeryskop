import SwiftUI

private struct ScreenTracking: ViewModifier {
    let name: String

    func body(content: Content) -> some View {
        content.task { ProductAnalytics.screen(name) }
    }
}

extension View {
    func trackScreen(_ name: String) -> some View {
        modifier(ScreenTracking(name: name))
    }
}
