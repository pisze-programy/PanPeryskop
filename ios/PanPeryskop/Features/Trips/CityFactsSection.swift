import SwiftUI

/// The six facts that decide a short break, then everything else on request.
struct CityFactsSection: View {
    let city: TravelCity
    @State private var showsAll = false

    private var facts: CityFacts { city.facts }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TripsSectionHeader(title: "O mieście")
                .padding(.horizontal, Theme.Spacing.l)
            grid
            moreButton
        }
        .sheet(isPresented: $showsAll) {
            CityFactsSheet(city: city)
        }
    }

    private var grid: some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: Theme.Spacing.s), GridItem(.flexible(), spacing: Theme.Spacing.s)],
            spacing: Theme.Spacing.s
        ) {
            CityFactTile(icon: "dollarsign.circle", value: dailyCost, label: "na miejscu / dzień")
            CityFactTile(icon: "checkmark.shield", value: score(facts.safety), label: "Bezpieczeństwo")
            CityFactTile(icon: "figure.walk", value: score(facts.walkability), label: "Zwiedzanie pieszo")
            CityFactTile(icon: "moon.stars", value: score(facts.nightlife), label: "Nocne życie")
            CityFactTile(icon: "bubble.left.and.bubble.right", value: score(facts.english), label: "Angielski")
            CityFactTile(icon: "star", value: score(facts.overall), label: "Ogólnie")
        }
        .padding(.horizontal, Theme.Spacing.l)
    }

    private var moreButton: some View {
        Button {
            Haptics.selection()
            showsAll = true
        } label: {
            HStack(spacing: Theme.Spacing.s) {
                Text("Wszystkie dane")
                    .font(.subheadline.weight(.semibold))
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.secondary)
            }
            .padding(Theme.Spacing.m)
            .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, Theme.Spacing.l)
    }

    private var dailyCost: String {
        "$\(max(1, facts.costLocalUsd / 30))"
    }

    private func score(_ value: Double?) -> String {
        guard let value else { return "—" }
        return String(format: "%.1f", value)
    }
}
