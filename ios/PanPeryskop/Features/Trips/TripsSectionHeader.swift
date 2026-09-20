import SwiftUI

struct TripsSectionHeader: View {
    let title: String
    var info: String? = nil
    var filterLabel: String? = nil
    var onFilter: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Divider()
            HStack(spacing: Theme.Spacing.s) {
                Text(title.uppercased())
                    .font(Theme.Typo.sectionLabel)
                    .kerning(0.6)
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
                if let filterLabel, let onFilter {
                    FilterButton(label: filterLabel, action: onFilter)
                }
                if let info {
                    TipButton(text: info)
                }
            }
        }
    }
}

struct TipButton: View {
    let text: String
    @State private var show = false

    var body: some View {
        Button {
            Haptics.selection()
            show.toggle()
        } label: {
            Image(systemName: "info.circle")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.secondary)
        }
        .buttonStyle(.plain)
        .popover(isPresented: $show, arrowEdge: .top) {
            Text(text)
                .font(.footnote)
                .foregroundColor(.primary)
                .padding(Theme.Spacing.m)
                .frame(maxWidth: 260, alignment: .leading)
                .presentationCompactAdaptation(.popover)
        }
    }
}

struct TripsSectionFooter: View {
    let text: String
    /// Shows the clickable "i" that opens the price + external-link disclaimer.
    var showsPriceInfo = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.xs) {
            Text(text)
                .font(.caption2)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if showsPriceInfo {
                PriceInfoButton()
            }
        }
    }
}
