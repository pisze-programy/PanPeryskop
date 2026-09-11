import SwiftUI

/// Inline error with a retry action — the app's failure state.
struct ErrorState: View {
    let message: String
    var retryTitle: String = "Spróbuj ponownie"
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            Text(message)
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            Button(retryTitle, action: onRetry)
                .font(.caption.weight(.semibold))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Theme.Spacing.l)
    }
}