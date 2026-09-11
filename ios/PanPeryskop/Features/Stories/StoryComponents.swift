import SwiftUI

struct ProgressBar: View {
    let fraction: Double
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.3))
                Capsule().fill(Color.white).frame(width: geo.size.width * fraction)
            }
        }
        .frame(height: 3)
    }
}

/// Subtle blurred gradient used behind the top (progress / close) and bottom
/// (description / actions) overlays. `bottomFade: true` fades the blur out toward
/// the bottom edge (top bar); `false` fades it out toward the top (bottom bar).
struct StoryBlurBar: View {
    let bottomFade: Bool

    var body: some View {
        ZStack {
            Rectangle().fill(Color.black.opacity(0.25))
            Rectangle().fill(.ultraThinMaterial)
        }
        .mask(
            LinearGradient(
                colors: [Color.black, Color.clear],
                startPoint: bottomFade ? .top : .bottom,
                endPoint: bottomFade ? .bottom : .top
            )
        )
        .allowsHitTesting(false)
    }
}

struct StoryAvatar: View {
    let url: String?
    let size: CGFloat

    var body: some View {
        Group {
            if let url, let avatarURL = URL(string: url) {
                AsyncImage(url: avatarURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().aspectRatio(contentMode: .fill)
                    default:
                        defaultAvatar
                    }
                }
            } else {
                defaultAvatar
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var defaultAvatar: some View {
        ZStack {
            Color.black
            Image("Logo")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .scaleEffect(0.85)
        }
    }
}

/// Retro split-flap style time ("HH:MM" or "--:--") — dark panels, white monospaced
/// digits, a hinge seam down the middle. Static look (no flip animation). Stretches
/// vertically to match the neighbouring text column.
struct FlipClockTime: View {
    let time: String

    var body: some View {
        HStack(spacing: 5) {
            FlipClockDigit(text: String(time.prefix(1)))
            FlipClockDigit(text: String(time.dropFirst(1).prefix(1)))
            colon
            FlipClockDigit(text: String(time.dropFirst(3).prefix(1)))
            FlipClockDigit(text: String(time.suffix(1)))
        }
    }

    private var colon: some View {
        VStack(spacing: 7) {
            Circle().fill(Color(red: 0.12, green: 0.13, blue: 0.15)).frame(width: 5, height: 5)
            Circle().fill(Color(red: 0.12, green: 0.13, blue: 0.15)).frame(width: 5, height: 5)
        }
        .padding(.horizontal, 2)
    }
}

struct FlipClockDigit: View {
    let text: String

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color(red: 0.12, green: 0.13, blue: 0.15))
            VStack(spacing: 0) {
                Rectangle()
                    .fill(Color.white.opacity(0.07))
                Rectangle()
                    .fill(Color.black.opacity(0.5))
                    .frame(height: 1)
                Rectangle()
                    .fill(Color.black.opacity(0.18))
            }
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            Text(text)
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundColor(.white)
        }
        .frame(width: 30, height: 50)
    }
}

/// Horizontally paged row of flip-clock times (one showtime per page) with dot
/// indicators underneath — cinema events with multiple sessions.
struct ShowtimesPager: View {
    let times: [String]
    var onInteraction: (Bool) -> Void = { _ in }
    var onSelect: (String) -> Void = { _ in }
    @State private var page: Int?
    @State private var isInteracting = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    ForEach(Array(times.enumerated()), id: \.offset) { _, t in
                        FlipClockTime(time: t)
                            .containerRelativeFrame(.horizontal)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $page)
            .frame(height: 50)
            .simultaneousGesture(
                DragGesture(minimumDistance: 1)
                    .onChanged { _ in
                        if !isInteracting { isInteracting = true; onInteraction(true) }
                    }
                    .onEnded { _ in
                        isInteracting = false
                        onInteraction(false)
                    }
            )

            HStack(spacing: 6) {
                ForEach(times.indices, id: \.self) { i in
                    Circle()
                        .fill(i == (page ?? 0) ? Color.blue : Color.secondary.opacity(0.3))
                        .frame(width: 9, height: 9)
                }
            }
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .onChange(of: page) { old, new in
            if old != new { Haptics.impact(.light) }
            if let idx = new, idx < times.count { onSelect(times[idx]) }
        }
    }
}
