import SwiftUI

/// Centered page indicator. Use for a horizontal pager; hide it when count <= 1.
struct PageDots: View {
    let count: Int
    let index: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<count, id: \.self) { i in
                Circle()
                    .fill(i == index ? Color.accentColor : Color.secondary.opacity(0.4))
                    .frame(width: 7, height: 7)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Theme.Spacing.s)
        .padding(.bottom, Theme.Spacing.xs)
    }
}