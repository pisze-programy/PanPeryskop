import SwiftUI

struct StoryTopBar: View {
    let posts: [Post]
    let currentIndex: Int
    let progressFraction: Double
    let topInset: CGFloat
    let onClose: () -> Void

    var body: some View {
        VStack {
            closeRow
            progressRow
            Spacer()
        }
        .padding(.top, topInset + 12)
        .background(alignment: .top) {
            StoryBlurBar(bottomFade: true)
                .frame(height: 190)
        }
    }

    private var closeRow: some View {
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
        }
        .padding(.horizontal, Theme.Spacing.l)
    }

    private var progressRow: some View {
        GeometryReader { geo in
            progressBars(width: geo.size.width)
        }
        .frame(height: 3)
        .padding(.horizontal, Theme.Spacing.s)
        .padding(.top, Theme.Spacing.l)
    }

    private func progressBars(width: CGFloat) -> some View {
        let spacing: CGFloat = 4
        let n = posts.count
        let many = n > 10
        let totalSpacing = spacing * CGFloat(max(0, n - 1))
        let inactiveW: CGFloat = many
            ? max(1.5, min(6, (width / 2 - totalSpacing) / CGFloat(max(1, n - 1))))
            : 0
        let activeW: CGFloat = many
            ? max(0, width - totalSpacing - inactiveW * CGFloat(n - 1))
            : 0
        return HStack(spacing: spacing) {
            ForEach(posts.indices, id: \.self) { index in
                progressSegment(index: index, many: many, activeW: activeW, inactiveW: inactiveW)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func progressSegment(index: Int, many: Bool, activeW: CGFloat, inactiveW: CGFloat) -> some View {
        let isActive = index == currentIndex
        let fraction = isActive ? progressFraction : (index < currentIndex ? 1 : 0)
        return ProgressBar(fraction: fraction)
            .frame(width: many ? (isActive ? activeW : inactiveW) : nil)
            .animation(.easeInOut(duration: 0.25), value: isActive)
            .animation(isActive ? .linear(duration: 0.1) : nil, value: progressFraction)
    }
}