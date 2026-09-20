import SwiftUI

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
            if post.isRestaurant {
                restaurantContent
            } else {
                eventOrLiveContent
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

    /// Curated restaurant: centred name (like events), the distinction and cuisine
    /// on one line, then the street address and the website link.
    private var restaurantContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text(post.restaurantInfo.name)
                .font(.headline)
                .foregroundColor(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
            HStack(spacing: Theme.Spacing.s) {
                if let award = post.restaurantAwardLabel {
                    Label(award, systemImage: post.restaurantStars > 0 ? "star.fill" : "fork.knife")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(post.restaurantStars > 0 ? .orange : .secondary)
                }
                if !post.restaurantInfo.cuisine.isEmpty {
                    Text(post.restaurantInfo.cuisine)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
            if !post.restaurantInfo.address.isEmpty {
                Text(post.restaurantInfo.address)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
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

    private var eventOrLiveContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            if post.isEvent {
                Text(post.eventInfo.title)
                    .font(.headline)
                    .foregroundColor(.primary)
                    // Always two lines: a one-line title would shorten the card and
                    // make the whole layout jump when swiping between stories.
                    .lineLimit(2, reservesSpace: true)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }

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

                if post.isEvent {
                    eventDetails
                } else {
                    liveAuthor
                }

                Spacer(minLength: 0)
            }
        }
    }

    /// Flip-clock value: first structured showtime, else the event start time, else
    /// the live post's publish time.
    private var clockTime: String {
        if let times = post.showtimes, !times.isEmpty { return times[0] }
        if post.isEvent { return post.eventInfo.time ?? "--:--" }
        return EventDateFormatter.time(post.created_at)
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

    /// Live: avatar + nickname, bottom-aligned with the flip-clock.
    private var liveAuthor: some View {
        HStack(spacing: Theme.Spacing.s) {
            StoryAvatar(url: post.author_avatar_url, size: 32)
            Text(post.author_name)
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(.primary)
        }
    }
}