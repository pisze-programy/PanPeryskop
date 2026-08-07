import SwiftUI

struct SettingsView: View {
    @AppStorage(Haptics.enabledKey) private var hapticsEnabled = true

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                HStack(spacing: 12) {
                    Image(systemName: "waveform")
                        .font(.title3)
                        .foregroundColor(.accentColor)
                        .frame(width: 32)

                    VStack(alignment: .leading, spacing: 2) {
                        Toggle("Wibracje", isOn: $hapticsEnabled)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                        Text("Delikatne wibracje przy tapnięciach i akcjach.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .padding(12)
                .background(.regularMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)

                PermissionCardsView(showsHeader: true)
            }
            .padding(.vertical, 20)
        }
        .navigationTitle("Ustawienia")
        .navigationBarTitleDisplayMode(.inline)
    }
}
