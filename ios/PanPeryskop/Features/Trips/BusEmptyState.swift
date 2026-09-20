import SwiftUI

/// Shown when the carrier has no bus on the chosen day. Kept the same shape and
/// height as the offers card, so switching days does not make the sheet jump.
struct BusEmptyState: View {
    let from: String
    let to: String

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            Image(systemName: "bus")
                .font(.title3)
                .foregroundColor(.secondary)
            Text("Brak połączeń")
                .font(.subheadline.weight(.semibold))
            Text("\(from) → \(to)")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Theme.Spacing.xl)
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
    }
}
