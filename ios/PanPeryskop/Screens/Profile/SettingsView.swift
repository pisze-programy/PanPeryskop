import SwiftUI

struct SettingsView: View {
    @AppStorage(Haptics.enabledKey) private var hapticsEnabled = true

    var body: some View {
        Form {
            Section {
                Toggle("Haptyka", isOn: $hapticsEnabled)
            } footer: {
                Text("Delikatne wibracje przy tapnięciach i akcjach.")
            }
        }
        .navigationTitle("Ustawienia")
        .navigationBarTitleDisplayMode(.inline)
    }
}
