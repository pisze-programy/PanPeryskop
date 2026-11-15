import SwiftUI

struct EventRowThumbnail: View {
    let post: Post
    let showtimes: [String]
    @Binding var selectedTime: String?
    let fallbackTime: String
    let onTap: () -> Void

    static let posterWidth: CGFloat = 108
    static let posterHeight: CGFloat = 144
    private static let cornerRadius: CGFloat = 10
    private static let scrimHeight: CGFloat = 68
    private static let cinemaSources: Set<String> = ["helios", "multikino", "cinemacity"]

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous)
        ZStack(alignment: .bottom) {
            artworkLayer
            bottomScrim
            clockOverlay
        }
        .frame(width: Self.posterWidth, height: Self.posterHeight)
        .clipShape(shape)
        .overlay(shape.stroke(Color.primary.opacity(0.08), lineWidth: 0.5))
    }

    private var artworkLayer: some View {
        ZStack {
            fallbackBackground
            remotePhoto
        }
        .frame(width: Self.posterWidth, height: Self.posterHeight)
        .contentShape(Rectangle())
        .onTapGesture {
            Haptics.selection()
            onTap()
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var remotePhoto: some View {
        if let url = post.resolvedThumbURL {
            RemoteImage(url: url, fadesIn: true)
        }
    }

    private var bottomScrim: some View {
        LinearGradient(
            stops: [
                .init(color: .clear, location: 0),
                .init(color: .black.opacity(0.45), location: 0.38),
                .init(color: .black.opacity(0.80), location: 0.75),
                .init(color: .black.opacity(0.92), location: 1),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .frame(height: Self.scrimHeight)
        .allowsHitTesting(false)
    }

    @ViewBuilder
    private var clockOverlay: some View {
        if showtimes.count > 1 {
            CompactShowtimesPager(
                times: showtimes,
                selectedTime: $selectedTime,
                onTap: onTap
            )
            .id(post.id)
            .padding(.bottom, 7)
        } else {
            CompactFlipClockView(time: showtimes.first ?? fallbackTime)
                .padding(.bottom, 8)
                .allowsHitTesting(false)
        }
    }

    private var fallbackBackground: some View {
        ZStack {
            Color(.tertiarySystemFill)
            Image(systemName: fallbackIcon)
                .font(.title3.weight(.medium))
                .foregroundStyle(.secondary)
                .offset(y: -14)
        }
    }

    private var fallbackIcon: String {
        if post.isRun { return "figure.run" }
        if post.clubNight != nil { return "music.note" }
        if isCinemaSource { return "film" }
        return tagFallbackIcon ?? "calendar"
    }

    private var isCinemaSource: Bool {
        guard let source = post.source?.lowercased() else { return false }
        return Self.cinemaSources.contains(source)
    }

    private var tagFallbackIcon: String? {
        let tags = post.tags ?? []
        if tags.contains("teatr") { return "theatermasks" }
        if tags.contains("koncerty") { return "music.mic" }
        if tags.contains("sport") { return "sportscourt" }
        if tags.contains("wystawy") { return "photo.artframe" }
        if tags.contains("rodzina") { return "figure.2.and.child.holdinghands" }
        return nil
    }
}
