import SwiftUI

struct StoryContent: View {
    let post: Post
    let topInset: CGFloat
    let onLoaded: (Post) -> Void

    var body: some View {
        Group {
            if post.clubNight != nil {
                clubNightLayout
            } else if post.isRun {
                runLayout
            } else if post.isRestaurant {
                restaurantLayout
            } else if let url = post.resolvedMediaURL {
                StoryPhoto(thumbURL: post.resolvedThumbURL, largeURL: url) { onLoaded(post) }
            } else {
                placeholderView
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }

    private var clubNightLayout: some View {
        GeometryReader { geo in
            ZStack {
                backdrop
                photoScrims(height: geo.size.height)
                clubBand
            }
        }
        .clipped()
    }

    private var runLayout: some View {
        GeometryReader { geo in
            ZStack {
                backdrop
                photoScrims(height: geo.size.height)
                VStack {
                    Spacer(minLength: 0)
                    RunStoryBand(title: post.eventInfo.title, distance: post.runDistance)
                    Spacer(minLength: 0)
                }
            }
        }
        .clipped()
    }

    private var restaurantLayout: some View {
        GeometryReader { geo in
            ZStack(alignment: .top) {
                backdrop
                RestaurantStoryBand(
                    name: post.restaurantInfo.name,
                    award: post.restaurantAwardLabel,
                    stars: post.restaurantStars,
                    cuisine: post.restaurantInfo.cuisine,
                    topPadding: topInset + 88
                )
            }
        }
        .clipped()
    }

    private var backdrop: some View {
        PhotoStoryBackdrop(
            url: post.resolvedMediaURL,
            thumbURL: post.resolvedThumbURL,
            shiftSeed: post.id
        ) {
            onLoaded(post)
        }
    }

    private func photoScrims(height: CGFloat) -> some View {
        VStack {
            scrim(colors: [.black.opacity(0.55), .clear], height: height * 0.30)
            Spacer(minLength: 0)
            scrim(colors: [.clear, .black.opacity(0.80)], height: height * 0.45)
        }
    }

    private func scrim(colors: [Color], height: CGFloat) -> some View {
        LinearGradient(colors: colors, startPoint: .top, endPoint: .bottom)
            .frame(height: height)
    }

    private var clubBand: some View {
        VStack {
            Spacer(minLength: 0)
            PhotoStoryBand(kicker: post.eventInfo.title, hero: clubHero, caption: clubCaption)
            Spacer(minLength: 0)
        }
    }

    /// The lineup is the hero. A night without a lineup falls back to the club.
    private var clubHero: String {
        if let lineup = post.clubNight?.lineup, !lineup.isEmpty { return cappedLineup(lineup) }
        if let venue = post.clubNight?.venue, !venue.isEmpty { return venue }
        return post.eventInfo.title
    }

    /// Keep the hero to three names, then a count — a long bill must never
    /// overflow the band.
    private func cappedLineup(_ lineup: [String]) -> String {
        guard lineup.count > 3 else { return lineup.joined(separator: " · ") }
        return "\(lineup.prefix(3).joined(separator: " · "))  +\(lineup.count - 3)"
    }

    private var clubCaption: String? {
        guard let lineup = post.clubNight?.lineup, !lineup.isEmpty else { return nil }
        return post.clubNight?.venue
    }

    private var placeholderView: some View {
        VStack(spacing: 12) {
            Image(systemName: "photo.badge.exclamationmark")
                .font(.system(size: 48)).foregroundColor(.white.opacity(0.5))
            Text("Nie można załadować")
                .font(.caption).foregroundColor(.white.opacity(0.5))
        }
    }
}
