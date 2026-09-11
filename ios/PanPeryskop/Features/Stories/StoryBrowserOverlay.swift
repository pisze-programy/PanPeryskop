import SwiftUI

/// Full-bleed bottom panel hosting the in-app browser, with swipe-down-to-close.
struct StoryBrowserOverlay: View {
    let url: URL
    /// Animated vertical offset while the panel slides in/out.
    let offset: CGFloat
    let bottomInset: CGFloat
    let onClose: () -> Void

    static var panelHeight: CGFloat { UIScreen.main.bounds.height * 0.7 }

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black
                .opacity(0.35 * (1 - min(offset, Self.panelHeight) / Self.panelHeight))
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { onClose() }

            VStack(spacing: 0) {
                Color.clear
                    .frame(height: 30)
                    .contentShape(Rectangle())
                    .overlay {
                        Capsule()
                            .fill(Color.secondary.opacity(0.5))
                            .frame(width: 36, height: 5)
                    }
                    .gesture(dragToClose)

                InAppBrowserView(url: url, bottomInset: bottomInset, onClose: onClose)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .frame(height: Self.panelHeight)
            .background(Color(.systemBackground))
            .clipShape(UnevenRoundedRectangle(
                topLeadingRadius: Theme.Radius.sheet, bottomLeadingRadius: 0,
                bottomTrailingRadius: 0, topTrailingRadius: Theme.Radius.sheet
            ))
            .shadow(color: .black.opacity(0.5), radius: 30, y: -12)
            .offset(y: offset)
        }
        .ignoresSafeArea(edges: .bottom)
        .zIndex(1000)
    }

    /// Native swipe-down-to-close on the grab strip — no custom drag-follow.
    private var dragToClose: some Gesture {
        DragGesture(minimumDistance: 24)
            .onEnded { value in
                let downward = value.translation.height
                let velocity = value.predictedEndTranslation.height - downward
                if downward > 80 || velocity > 500 { onClose() }
            }
    }
}