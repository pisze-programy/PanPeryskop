import SwiftUI
import UIKit

/// Bottom info card of the story (events + live share the layout): title (events),
/// date + flip-clock / showtime pager, venue+link or author, and the badges row.
struct StoryInfoCard: View {
    let post: Post
    let tags: [TagPill]
    @Binding var selectedShowtime: String?
    /// The showtime pager is being used → hold/resume the story timer.
    let onPagerInteracting: (Bool) -> Void
    /// Opens the in-app browser. The flag keeps any host in-app (restaurant sites
    /// are arbitrary domains, outside the fixed allow-list).
    let onOpenBrowser: (URL, Bool) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            if let club = post.clubNight {
                clubContent(club)
            } else if post.isRestaurant {
                restaurantContent
            } else if post.isRun {
                runContent
            } else {
                eventContent
            }

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

    /// The band carries the event name and the lineup, so the box keeps the club,
    /// the genres, the age/price and the link.
    private func clubContent(_ club: ClubNightMeta) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
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
            clubMetaLine(club)
            clubLink
        }
    }

    /// A running event: the mask carries the name, the city and the distance, so
    /// the box keeps the day and the link. No clock — the source has no hour.
    private var runContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Label(DayLabels.title(for: Date(timeIntervalSince1970: TimeInterval(post.created_at) / 1000)), systemImage: "calendar")
                .font(.headline)
                .foregroundColor(.primary)
            if let url = post.link_url.flatMap(URL.init) {
                Button {
                    openRunLink(url)
                } label: {
                    Label("Strona wydarzenia", systemImage: "arrow.up.right")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.blue)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func openRunLink(_ url: URL) {
        if url.host?.contains("google.") == true {
            UIApplication.shared.open(url)
        } else {
            onOpenBrowser(url, true)
        }
    }

    /// The grey line: the age and the price, each only when it says something.
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
            Button {
                onOpenBrowser(url, false)
            } label: {
                Label("Strona wydarzenia", systemImage: "arrow.up.right")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(.blue)
            }
            .buttonStyle(.plain)
        }
    }

    /// Curated restaurant: the mask carries the identity (name, distinction,
    /// cuisine), so the box keeps only the practical line — the street address
    /// and the website link.
    private var restaurantContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            if !post.restaurantInfo.address.isEmpty {
                Label(post.restaurantInfo.address, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
            if let url = post.link_url.flatMap(URL.init) {
                Button {
                    onOpenBrowser(url, true)
                } label: {
                    Label("Strona restauracji", systemImage: "arrow.up.right")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.blue)
                }
                .buttonStyle(.plain)
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
                VStack(alignment: .center, spacing: 6) {
                    Text(EventDateFormatter.eventDay(post.created_at))
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
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
                        // Match ShowtimesPager exactly: clock 50 + stack spacing 6 +
                        // indicator 4 = 60. A taller single-time column would push the
                        // whole card up, so switching stories made the layout jump.
                        Spacer().frame(height: 4)
                    }
                }
                .frame(width: 168)

                eventDetails

                Spacer(minLength: 0)
            }
        }
    }

    private var clockTime: String {
        if let times = post.showtimes, !times.isEmpty { return times[0] }
        return post.eventInfo.time ?? "--:--"
    }

    /// Pager selection, only if it still belongs to the current post's showtimes.
    private var effectiveShowtime: String? {
        guard let sel = selectedShowtime, let times = post.showtimes, times.contains(sel) else { return nil }
        return sel
    }

    /// Events: venue above the link, both bottom-aligned with the flip-clock.
    private var eventDetails: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            if let venue = post.eventInfo.venue {
                Label(venue, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
            // Deep-link to the selected showtime (default: first); fall back to the
            // event page link when the post has no booking.
            if let url = post.bookingURL(for: effectiveShowtime ?? clockTime) ?? post.link_url.flatMap(URL.init) {
                Button {
                    onOpenBrowser(url, false)
                } label: {
                    Label("Strona wydarzenia", systemImage: "arrow.up.right")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.blue)
                }
                .buttonStyle(.plain)
            }
        }
    }
}