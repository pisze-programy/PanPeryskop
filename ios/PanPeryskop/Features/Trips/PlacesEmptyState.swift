import SwiftUI

struct PlacesEmptyState: View {
    let kind: PlaceKind

    var body: some View {
        Text(kind == .attraction ? "Brak atrakcji w tym mieście" : "Brak wyników")
            .font(.subheadline)
            .foregroundColor(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, Theme.Spacing.xl)
    }
}
