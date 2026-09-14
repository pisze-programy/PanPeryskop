import SwiftUI

/// Filled capsule call-to-action, optionally with a trailing value (e.g. a price).
struct CapsuleButton: View {
    let title: String
    var trailingText: String? = nil
    var tint: Color = .accentColor
    /// Fill the available width.
    var fullWidth: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Text(title)
                if let trailingText {
                    Spacer()
                    Text(trailingText)
                }
            }
            .font(.subheadline.weight(.bold))
            .foregroundColor(.white)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, 10)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background(Capsule().fill(tint))
        }
        .buttonStyle(.plain)
    }
}