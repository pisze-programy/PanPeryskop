import SwiftUI

struct StoryBadgesView: View {
    let post: Post
    let tags: [TagPill]
    var showsSponsored: Bool = true

    @Environment(\.colorScheme) private var colorScheme
    @State private var showPriceInfo = false

    var body: some View {
        badgeContainer(for: badgeItems)
    }

    @ViewBuilder
    private func badgeContainer(for items: [EventBadge]) -> some View {
        if !items.isEmpty {
            badgeStrip(items)
                .sheet(isPresented: $showPriceInfo) {
                    PriceInfoSheet()
                }
        }
    }

    private func badgeStrip(_ items: [EventBadge]) -> some View {
        let row = badgesHStack(items)
        return ViewThatFits(in: .horizontal) {
            row
            ScrollView(.horizontal, showsIndicators: false) {
                row
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private struct EventBadge: Identifiable {
        let id: String
        let text: String
        let icon: String
        let color: Color
    }

    private var badgeItems: [EventBadge] {
        let neutralColor = Theme.Palette.neutral(colorScheme)
        var items: [EventBadge] = []
        if includesSponsoredBadge {
            items.append(EventBadge(id: "sponsored", text: "SPONSOROWANE", icon: "megaphone.fill", color: neutralColor))
        }
        if post.is_sold_out == true {
            items.append(EventBadge(id: "soldout", text: "WYPRZEDANE", icon: "xmark.circle.fill", color: .red))
        }
        items.append(contentsOf: tagBadges(neutralColor: neutralColor))
        return items
    }

    private var includesSponsoredBadge: Bool {
        showsSponsored && post.is_sponsored == true
    }

    private func tagBadges(neutralColor: Color) -> [EventBadge] {
        (post.tags ?? []).compactMap { tagId in
            guard let label = tagBadgeLabel(tagId) else { return nil }
            return EventBadge(id: "tag-\(tagId)", text: label.uppercased(), icon: "tag.fill", color: neutralColor)
        }
    }

    private func badgesHStack(_ items: [EventBadge]) -> some View {
        HStack(spacing: Theme.Spacing.s) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, badge in
                badgeEntry(index: index, badge: badge)
            }
        }
        .fixedSize(horizontal: true, vertical: false)
    }

    @ViewBuilder
    private func badgeEntry(index: Int, badge: EventBadge) -> some View {
        if index > 0 {
            Text("•")
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        badgeView(badge)
    }

    @ViewBuilder
    private func badgeView(_ badge: EventBadge) -> some View {
        if badge.id == "sponsored" {
            Button {
                Haptics.selection()
                showPriceInfo = true
            } label: {
                badgeLabel(badge)
            }
            .buttonStyle(.plain)
        } else {
            badgeLabel(badge)
        }
    }

    private func badgeLabel(_ badge: EventBadge) -> some View {
        Label(badge.text, systemImage: badge.icon)
            .font(.caption2)
            .foregroundColor(badge.color)
    }

    private func tagBadgeLabel(_ id: String) -> String? {
        tags.first(where: { $0.id == id })?.label
    }
}
