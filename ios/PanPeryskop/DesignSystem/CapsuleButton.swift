import SwiftUI

struct CapsuleButton: View {
    let title: String
    var trailingText: String? = nil
    var tint: Color = .accentColor
    var fullWidth: Bool = false
    var isEnabled: Bool = true
    let action: () -> Void

    static let height: CGFloat = 44
    private static let horizontalPadding = Theme.Spacing.l
    private static let disabledOpacity: Double = 0.45

    var body: some View {
        Button(action: action) {
            label
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
    }

    private var label: some View {
        HStack {
            Text(title)
            if let trailingText {
                Spacer()
                Text(trailingText)
            }
        }
        .font(.subheadline.weight(.bold))
        .foregroundColor(.white)
        .padding(.horizontal, Self.horizontalPadding)
        .frame(height: Self.height)
        .frame(maxWidth: fullWidth ? .infinity : nil)
        .background(Capsule().fill(tint))
        .opacity(isEnabled ? 1 : Self.disabledOpacity)
    }
}
