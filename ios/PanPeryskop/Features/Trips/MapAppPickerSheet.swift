import SwiftUI
import CoreLocation
import UIKit

struct MapAppPickerSheet: View {
    let coordinate: CLLocationCoordinate2D
    let title: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            Text("Otwórz w:")
                .font(Theme.Typo.sectionTitle)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Theme.Spacing.l)
            option("Google Maps") { open(googleURL) }
            Divider()
            option("Apple Maps") { open(appleURL) }
        }
        .presentationDetents([.height(190)])
    }

    private func option(_ label: String, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.selection()
            action()
        } label: {
            HStack {
                Text(label)
                    .font(.body)
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var appleURL: URL? {
        URL(string: "http://maps.apple.com/?ll=\(coordinate.latitude),\(coordinate.longitude)&q=\(encodedTitle)")
    }

    private var googleURL: URL? {
        let app = URL(string: "comgooglemaps://?q=\(coordinate.latitude),\(coordinate.longitude)")
        if let app, UIApplication.shared.canOpenURL(app) { return app }
        return URL(string: "https://www.google.com/maps/search/?api=1&query=\(coordinate.latitude),\(coordinate.longitude)")
    }

    private var encodedTitle: String {
        title.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? title
    }

    private func open(_ url: URL?) {
        guard let url else { return }
        dismiss()
        UIApplication.shared.open(url)
    }
}
