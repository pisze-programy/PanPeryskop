import SwiftUI

/// Small capsule label for a run distance. Shared by the event detail row and the
/// city event card, so both read the same at any size.
struct DistanceTag: View {
    let label: String
    var tint: Color? = nil

    private static let horizontalPadding: CGFloat = 8
    private static let verticalPadding: CGFloat = 3

    var body: some View {
        Text(label)
            .font(.caption.weight(.semibold))
            .foregroundColor(tint ?? .secondary)
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
            .padding(.horizontal, Self.horizontalPadding)
            .padding(.vertical, Self.verticalPadding)
            .background(background, in: Capsule())
    }

    private var background: Color {
        guard let tint else { return Theme.Palette.surface }
        return tint.opacity(0.15)
    }
}
