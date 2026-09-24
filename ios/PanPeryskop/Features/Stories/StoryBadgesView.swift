import SwiftUI

struct StoryBadgesView: View {
    let post: Post
    let tags: [TagPill]

    @Environment(\.colorScheme) private var colorScheme
    @State private var showPriceInfo = false

    var body: some View {
        let row = badgesHStack
        return ViewThatFits(in: .horizontal) {
            row
            ScrollView(.horizontal, showsIndicators: false) {
                row
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .sheet(isPresented: $showPriceInfo) {
            PriceInfoSheet()
        }
    }

    private struct EventBadge: Identifiable {
        let id: String
        let text: String
        let icon: String
        let color: Color
    }

    private var badgeItems: [EventBadge] {
        var items: [EventBadge] = []
        if post.is_sponsored == true {
            items.append(EventBadge(id: "sponsored", text: "SPONSOROWANE", icon: "megaphone.fill", color: badgeGray))
        }
        if post.is_sold_out == true {
            items.append(EventBadge(id: "soldout", text: "WYPRZEDANE", icon: "xmark.circle.fill", color: .red))
        }
        for tagId in post.tags ?? [] {
            if let label = tagBadgeLabel(tagId) {
                items.append(EventBadge(id: "tag-\(tagId)", text: label.uppercased(), icon: "tag.fill", color: badgeGray))
            }
        }
        return items
    }

    private var badgeGray: Color {
        colorScheme == .dark
            ? Color(red: 0.75, green: 0.76, blue: 0.78)
            : Color(red: 0.35, green: 0.36, blue: 0.38)
    }

    private var badgesHStack: some View {
        HStack(spacing: 8) {
            ForEach(Array(badgeItems.enumerated()), id: \.element.id) { index, badge in
                if index > 0 {
                    Text("•")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
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
        }
        .fixedSize(horizontal: true, vertical: false)
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
