import SwiftUI

struct PageDots: View {
    let count: Int
    let index: Int

    private static let dotSize: CGFloat = 7
    private static let spacing: CGFloat = 6
    private static let inactiveOpacity: Double = 0.4

    var body: some View {
        HStack(spacing: Self.spacing) {
            ForEach(0..<count, id: \.self) { position in
                Circle()
                    .fill(color(for: position))
                    .frame(width: Self.dotSize, height: Self.dotSize)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Theme.Spacing.s)
        .padding(.bottom, Theme.Spacing.xs)
    }

    private func color(for position: Int) -> Color {
        position == index ? .accentColor : Color.secondary.opacity(Self.inactiveOpacity)
    }
}
