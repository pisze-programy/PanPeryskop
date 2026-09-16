import SwiftUI

struct CapsuleButton: View {
    let title: String
    var trailingText: String? = nil
    var tint: Color = .accentColor
    var fullWidth: Bool = false
    var isEnabled: Bool = true
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
            .opacity(isEnabled ? 1 : 0.45)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
    }
}
