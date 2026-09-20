import SwiftUI

/// Inline "i" beside the price note. Opens the price and external-link
/// disclaimer (affiliate relationship, indicative prices) as a modal.
struct PriceInfoButton: View {
    @State private var showInfo = false

    var body: some View {
        Button {
            Haptics.selection()
            showInfo = true
        } label: {
            Image(systemName: "info.circle")
                .font(.caption2.weight(.semibold))
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
        .accessibilityLabel("Informacje o cenach i linkach")
        .sheet(isPresented: $showInfo) {
            PriceInfoSheet()
        }
    }
}

/// Price + external-link disclaimer. Every price is indicative, and outbound
/// links may be affiliate links; the user is never charged more.
struct PriceInfoSheet: View {
    @Environment(\.dismiss) private var dismiss

    private static let paragraphs = [
        "PanPeryskop to niezależna wyszukiwarka wydarzeń. Zakup odbywa się bezpośrednio u sprzedawcy.",
        "W niektórych przypadkach możemy otrzymać prowizję od sprzedawcy. To relacja afiliacyjna — wspiera darmowe działanie aplikacji.",
        "Nigdy nie płacisz więcej: cena u sprzedawcy pozostaje taka sama.",
        "Linki do sprzedawców nie oznaczają oficjalnej współpracy ani rekomendacji.",
        "Ceny są orientacyjne i mogą się zmienić u dostawcy.",
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            Text("Ceny i linki zewnętrzne")
                .font(.title3.weight(.bold))

            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    ForEach(Self.paragraphs, id: \.self) { paragraph in
                        Text(paragraph)
                            .font(.subheadline)
                            .foregroundColor(.primary)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }

            Button("Zamknij") { dismiss() }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(Theme.Spacing.l)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .presentationBackground(Color(.systemBackground))
    }
}
