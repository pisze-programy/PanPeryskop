import SwiftUI

struct SettingsView: View {
    @AppStorage(Haptics.enabledKey) private var hapticsEnabled = true
    @AppStorage(NotificationSettings.mediaNearbyLiveKey) private var mediaNearbyLive = true
    @AppStorage(NotificationSettings.mediaNearbyEventsKey) private var mediaNearbyEvents = true
    @AppStorage(NotificationSettings.mediaNearbyRangeKey) private var mediaNearbyRange = "city"

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

                notificationsCard

                PermissionCardsView(showsHeader: true)
            }
            .padding(.vertical, 20)
        }
        .navigationTitle("Ustawienia")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var notificationsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "bell.badge.fill")
                    .font(.title3)
                    .foregroundColor(.accentColor)
                    .frame(width: 32)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Powiadomienia")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                    Text("Powiadomienia o nowych mediach dodanych w okolicy.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Toggle("Nowe Live w okolicy", isOn: $mediaNearbyLive)
                .font(.subheadline)
            Toggle("Nowe Wydarzenia w okolicy", isOn: $mediaNearbyEvents)
                .font(.subheadline)

            if mediaNearbyLive || mediaNearbyEvents {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Zakres")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Picker("Zakres", selection: $mediaNearbyRange) {
                        Text("100 m").tag("100")
                        Text("300 m").tag("300")
                        Text("Miasto").tag("city")
                    }
                    .pickerStyle(.segmented)
                }
                .padding(.top, 4)
            }
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }
}
