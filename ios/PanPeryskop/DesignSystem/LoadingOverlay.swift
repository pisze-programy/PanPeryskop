import SwiftUI

/// Centered spinner with an optional caption — the app's loading state.
struct LoadingOverlay: View {
    var message: String? = nil

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            ProgressView()
            if let message {
                Text(message)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Theme.Spacing.l)
    }
}