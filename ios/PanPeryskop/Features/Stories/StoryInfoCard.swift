import SwiftUI
import UIKit

struct StoryInfoCard: View {
    let post: Post
    let tags: [TagPill]
    @Binding var selectedShowtime: String?
    let onPagerInteracting: (Bool) -> Void
    let onOpenBrowser: (URL, Bool) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            cardContent
            StoryBadgesView(post: post, tags: tags)
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sheet, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.sheet, style: .continuous)
                .stroke(Color.white.opacity(0.25), lineWidth: 0.5)
        )
    }

    @ViewBuilder
    private var cardContent: some View {
        if let club = post.clubNight {
            clubContent(club)
        } else if post.isRestaurant {
            restaurantContent
        } else if post.isRun {
            runContent
        } else {
            eventContent
        }
    }

    private func clubContent(_ club: ClubNightMeta) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            clubHeaderRow(club)
            clubMetaLine(club)
            clubLink
        }
    }

    private func clubHeaderRow(_ club: ClubNightMeta) -> some View {
        HStack(spacing: Theme.Spacing.s) {
            if let venue = club.venue, !venue.isEmpty {
                Label(venue, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
            if let genres = club.genresText {
                Text(genres)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
        }
    }

    private var runContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Label(DayLabels.title(for: Date(timeIntervalSince1970: TimeInterval(post.created_at) / 1000)), systemImage: "calendar")
                .font(.headline)
                .foregroundColor(.primary)
            if let url = post.link_url.flatMap(URL.init) {
                externalLinkButton(title: "Strona wydarzenia") {
                    openRunLink(url)
                }
            }
        }
    }

    @ViewBuilder
    private func clubMetaLine(_ club: ClubNightMeta) -> some View {
        let parts = [club.priceText, club.ageText].compactMap { $0 }
        if !parts.isEmpty {
            Text(parts.joined(separator: " · "))
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    @ViewBuilder
    private var clubLink: some View {
        if let url = post.link_url.flatMap(URL.init) {
            externalLinkButton(title: "Strona wydarzenia") {
                openRestrictedLink(url)
            }
        }
    }

    private var restaurantContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            if !post.restaurantInfo.address.isEmpty {
                Label(post.restaurantInfo.address, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
            if let url = post.link_url.flatMap(URL.init) {
                externalLinkButton(title: "Strona restauracji") {
                    openUnrestrictedLink(url)
                }
            }
        }
    }

    private var eventContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Text(post.eventInfo.title)
                .font(.headline)
                .foregroundColor(.primary)
                .lineLimit(2, reservesSpace: true)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)

            HStack(alignment: .center, spacing: Theme.Spacing.l) {
                eventScheduleColumn
                eventDetails
                Spacer(minLength: 0)
            }
        }
    }

    private var eventScheduleColumn: some View {
        VStack(alignment: .center, spacing: 6) {
            Text(EventDateFormatter.eventDay(post.created_at))
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity)
            scheduleTimeView
        }
        .frame(width: 168)
    }

    @ViewBuilder
    private var scheduleTimeView: some View {
        if let times = post.showtimes, times.count > 1 {
            ShowtimesPager(times: times) { interacting in
                onPagerInteracting(interacting)
            } onSelect: { time in
                selectedShowtime = time
            }
            .id(post.id)
        } else {
            FlipClockTime(time: clockTime)
                .frame(maxWidth: .infinity, alignment: .center)
            // Match ShowtimesPager total height (60 pt) to prevent vertical layout jumps.
            Spacer().frame(height: 4)
        }
    }

    private var clockTime: String {
        if let times = post.showtimes, !times.isEmpty { return times[0] }
        return post.eventInfo.time ?? "--:--"
    }

    private var effectiveShowtime: String? {
        guard let sel = selectedShowtime, let times = post.showtimes, times.contains(sel) else { return nil }
        return sel
    }

    private var eventDetails: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            if let venue = post.eventInfo.venue {
                Label(venue, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
            if let url = post.bookingURL(for: effectiveShowtime ?? clockTime) ?? post.link_url.flatMap(URL.init) {
                externalLinkButton(title: "Strona wydarzenia") {
                    openRestrictedLink(url)
                }
            }
        }
    }

    private func externalLinkButton(title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: "arrow.up.right")
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(.blue)
        }
        .buttonStyle(.plain)
    }

    private func openRunLink(_ url: URL) {
        if isGoogleHost(url) {
            openExternally(url)
        } else {
            openUnrestrictedLink(url)
        }
    }

    private func openUnrestrictedLink(_ url: URL) {
        guard isHTTPURL(url) else {
            openExternally(url)
            return
        }
        onOpenBrowser(url, true)
    }

    private func openRestrictedLink(_ url: URL) {
        guard isAllowedInApp(url) else {
            openExternally(url)
            return
        }
        onOpenBrowser(url, false)
    }

    private func isAllowedInApp(_ url: URL) -> Bool {
        guard isHTTPURL(url), let host = url.host else { return false }
        return AllowedWebDomains.isAllowed(host)
    }

    private func isHTTPURL(_ url: URL) -> Bool {
        let scheme = url.scheme?.lowercased()
        return scheme == "http" || scheme == "https"
    }

    private func isGoogleHost(_ url: URL) -> Bool {
        url.host?.lowercased().contains("google.") == true
    }

    private func openExternally(_ url: URL) {
        MetaSignals.outbound(url: url)
        ProductAnalytics.outbound(url: url)
        UIApplication.shared.open(url)
    }
}