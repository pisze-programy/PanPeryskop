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
    @State private var detent: PresentationDetent = .medium

    private static let paragraphs = [
        "PanPeryskop to niezależna wyszukiwarka wydarzeń. Zakup odbywa się bezpośrednio u sprzedawcy.",
        "W niektórych przypadkach możemy otrzymać prowizję od sprzedawcy. To relacja afiliacyjna — wspiera darmowe działanie aplikacji.",
        "Nigdy nie płacisz więcej: cena u sprzedawcy pozostaje taka sama.",
        "Linki do sprzedawców nie oznaczają oficjalnej współpracy ani rekomendacji.",
        "Ceny są orientacyjne i mogą się zmienić u dostawcy.",
    ]

    var body: some View {
        SheetShell(detent: $detent, detents: [.medium]) {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                Text("Ceny i linki zewnętrzne")
                    .font(.title3.weight(.bold))
                ScrollView(showsIndicators: false) {
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
                CapsuleButton(title: "Zamknij", fullWidth: true, cornerRadius: Theme.Radius.card) { dismiss() }
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.xl)
            .padding(.bottom, Theme.Spacing.l)
        }
    }
}
