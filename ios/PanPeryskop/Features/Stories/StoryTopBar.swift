import SwiftUI

/// Top overlay of the story: close button, optional report menu and the progress row.
struct StoryTopBar: View {
    let posts: [Post]
    let currentIndex: Int
    let progressFraction: Double
    /// The report menu is hidden for event/cinema stories.
    let showsMenu: Bool
    let topInset: CGFloat
    let onClose: () -> Void
    let onReport: () -> Void

    var body: some View {
        VStack {
            HStack {
                Button {
                    Haptics.selection()
                    onClose()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 40, height: 40)
                        .background(.ultraThinMaterial)
                        .clipShape(Circle())
                }
                Spacer()
                if showsMenu {
                    Menu {
                        Button {
                            onReport()
                        } label: {
                            Label("Zgłoś", systemImage: "flag")
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(width: 40, height: 40)
                            .background(.ultraThinMaterial)
                            .clipShape(Circle())
                    }
                    .simultaneousGesture(TapGesture().onEnded { Haptics.selection() })
                }
            }
            .padding(.horizontal, Theme.Spacing.l)

            // Progress — full width. Many stories (>10) render the active one as a
            // large bar and the rest as thin notches so the row never squeezes.
            GeometryReader { geo in
                let spacing: CGFloat = 4
                let n = posts.count
                let many = n > 10
                let inactiveW: CGFloat = many
                    ? max(1.5, min(6, (geo.size.width / 2 - spacing * CGFloat(n - 1)) / CGFloat(max(1, n - 1))))
                    : 0
                let activeW: CGFloat = many
                    ? geo.size.width - spacing * CGFloat(n - 1) - inactiveW * CGFloat(n - 1)
                    : 0
                HStack(spacing: spacing) {
                    ForEach(posts.indices, id: \.self) { idx in
                        let isActive = idx == currentIndex
                        ProgressBar(fraction: isActive ? progressFraction : (idx < currentIndex ? 1 : 0))
                            .frame(width: many ? (isActive ? activeW : inactiveW) : nil)
                            .animation(.easeInOut(duration: 0.25), value: isActive)
                            .animation(.linear(duration: 0.1), value: progressFraction)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .frame(height: 3)
            .padding(.horizontal, Theme.Spacing.s)
            .padding(.top, Theme.Spacing.l)

            Spacer()
        }
        .padding(.top, topInset + 12)
        .background(alignment: .top) {
            StoryBlurBar(bottomFade: true)
                .frame(height: 190)
        }
    }
}