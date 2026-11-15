import SwiftUI

struct EventRowCard: View {
    let post: Post
    let tags: [TagPill]
    let onSelect: (Post, String?) -> Void

    @Environment(\.region) private var region
    @State private var selectedShowtime: String?

    private static let borderOpacity: Double = 0.06

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            thumbnailView
            detailsButton
        }
        .padding(Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            Color(.secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                .stroke(Color.primary.opacity(Self.borderOpacity), lineWidth: 0.5)
        )
        .onChange(of: post.id) { _, _ in
            selectedShowtime = nil
        }
    }

    private var thumbnailView: some View {
        EventRowThumbnail(
            post: post,
            showtimes: validShowtimes,
            selectedTime: $selectedShowtime,
            fallbackTime: fallbackTime
        ) {
            onSelect(post, effectiveSelectedTime)
        }
    }

    private var detailsButton: some View {
        Button {
            Haptics.selection()
            onSelect(post, effectiveSelectedTime)
        } label: {
            HStack(alignment: .center, spacing: Theme.Spacing.s) {
                textColumn
                trailingChevron
            }
            .frame(maxWidth: .infinity, minHeight: EventRowThumbnail.posterHeight, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var trailingChevron: some View {
        Image(systemName: "chevron.right")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.tertiary)
            .accessibilityHidden(true)
    }

    private var textColumn: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            titleText
            runDistanceLine
            Spacer(minLength: Theme.Spacing.s)
            bottomMetadataGroup
        }
        .frame(maxWidth: .infinity, minHeight: EventRowThumbnail.posterHeight, alignment: .topLeading)
    }

    @ViewBuilder
    private var bottomMetadataGroup: some View {
        if hasBottomMetadata {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                venueLine
                badgesLine
            }
        }
    }

    @ViewBuilder
    private var runDistanceLine: some View {
        if let distance = localizedRunDistance {
            DistanceTag(label: distance)
        }
    }

    @ViewBuilder
    private var badgesLine: some View {
        if showsBadges {
            StoryBadgesView(post: post, tags: tags, showsSponsored: false)
                .padding(.top, 2)
        }
    }

    private var titleText: some View {
        Text(post.eventInfo.title)
            .font(.headline)
            .foregroundStyle(.primary)
            .lineLimit(3)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder
    private var venueLine: some View {
        if let venue = resolvedVenue {
            Label(venue, systemImage: "mappin.and.ellipse")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    private var hasBottomMetadata: Bool {
        resolvedVenue != nil || showsBadges
    }

    private var validShowtimes: [String] {
        ProviderSortRank.validShowtimes(for: post)
    }

    private var fallbackTime: String {
        ProviderSortRank.effectiveTime(for: post) ?? "--:--"
    }

    private var effectiveSelectedTime: String? {
        if let selectedShowtime, validShowtimes.contains(selectedShowtime) {
            return selectedShowtime
        }
        return validShowtimes.first ?? ProviderSortRank.effectiveTime(for: post)
    }

    private var localizedRunDistance: String? {
        guard post.isRun, let raw = post.runDistance, !raw.isEmpty else { return nil }
        return Vocabulary.word(raw, language: region.languageCode) ?? raw
    }

    private var resolvedVenue: String? {
        let candidate = post.clubNight?.venue ?? (post.isRun ? post.runCity : post.eventInfo.venue)
        guard let trimmed = candidate?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty
        else { return nil }
        return trimmed
    }

    private var showsBadges: Bool {
        if post.is_sold_out == true { return true }
        let knownIds = Set(tags.map(\.id))
        return (post.tags ?? []).contains { knownIds.contains($0) }
    }
}
