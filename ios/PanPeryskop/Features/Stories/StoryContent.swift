import SwiftUI

struct StoryContent: View {
    let post: Post
    let isActive: Bool
    @Binding var paused: Bool
    let onLoaded: (Post) -> Void
    let onFinished: () -> Void
    let onProgress: (Double) -> Void
    @State private var showThumb = true
    /// Full-res image fade-in over the pixelated thumb preview (photo stories).
    @State private var fullLoaded = false
    @State private var fullFailed = false

    var body: some View {
        Group {
        if post.type == .video, let url = post.resolvedMediaURL {
            ZStack {
                StoryVideoPlayer(
                    url: url,
                    isActive: isActive,
                    paused: $paused,
                    onFinished: onFinished,
                    onStarted: { showThumb = false },
                    onReady: { onLoaded(post) },
                    onProgress: onProgress
                )
                if showThumb, post.hasThumb, let thumbURL = post.resolvedThumbURL {
                    AsyncImage(url: thumbURL) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().aspectRatio(contentMode: .fit)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                        case .failure:
                            Color.clear
                        case .empty:
                            Color.black
                        @unknown default:
                            Color.clear
                        }
                    }
                    .allowsHitTesting(false)
                }
            }
        } else if let url = post.resolvedMediaURL {
                // Thumb preview renders immediately with the SAME composition as the
                // full image (band + blurred cover background) so nothing pops in size
                // when the full-res fades in — only sharpness changes.
                ZStack(alignment: .center) {
                    if post.hasThumb, let thumbURL = post.resolvedThumbURL {
                        AsyncImage(url: thumbURL) { tp in
                            switch tp {
                            case .success(let thumb):
                                photoLayout(thumb, withBg: true)
                                    .blur(radius: 3)
                            default:
                                Color.clear
                            }
                        }
                    } else {
                        Color.clear
                    }

                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            photoLayout(image, withBg: true)
                                .opacity(fullLoaded ? 1 : 0)
                                .onAppear {
                                    onLoaded(post)
                                    withAnimation(.easeOut(duration: 0.3)) { fullLoaded = true }
                                }
                        case .failure:
                            placeholderView
                                .opacity(fullFailed ? 1 : 0)
                                .onAppear { withAnimation(.easeIn(duration: 0.2)) { fullFailed = true } }
                        case .empty:
                            Color.clear
                        @unknown default:
                            Color.clear
                        }
                    }
                }
                .clipped()
        } else if post.clubNight != nil {
            clubNightLayout
        } else {
            placeholderView
        }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
}

    /// A club night has no photo of its own — the source's flyer is not ours. The
    /// card composes one: a shared club photo, two black scrims, and the identity
    /// band in the middle. The bottom box is `StoryInfoCard`, drawn by the parent.
    private var clubNightLayout: some View {
        GeometryReader { geo in
            ZStack {
                PhotoStoryBackdrop(shiftSeed: post.id)
                VStack {
                    LinearGradient(
                        colors: [.black.opacity(0.55), .clear],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: geo.size.height * 0.30)
                    Spacer(minLength: 0)
                    LinearGradient(
                        colors: [.clear, .black.opacity(0.80)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: geo.size.height * 0.45)
                }
                bandOverlay
            }
        }
        .clipped()
    }

    @ViewBuilder
    private var bandOverlay: some View {
        if let club = post.clubNight {
            VStack {
                Spacer(minLength: 0)
                PhotoStoryBand(
                    kicker: nil,
                    hero: club.lineupText ?? post.eventInfo.title,
                    caption: club.venue
                )
                Spacer(minLength: 0)
            }
        }
    }

    /// The exact photo composition used by the story — a 9:16 foreground band,
    /// plus the blurred cover background only when `withBg` (the thumb preview is
    /// band-only; the background fades in together with the full-res image).
    private func photoLayout(_ image: Image, withBg: Bool) -> some View {
        let frameHeight = UIScreen.main.bounds.height * 0.7
        let frameWidth = frameHeight * 9 / 16

        return ZStack(alignment: .center) {
            if withBg {
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: UIScreen.main.bounds.width, height: UIScreen.main.bounds.height)
                    .clipped()
                    .blur(radius: 12)
                    .opacity(0.8)
                    .scaleEffect(1.05)
            }

            image
                .resizable()
                .aspectRatio(contentMode: .fill)
                .padding(.vertical, 90)
                .frame(width: frameWidth, height: frameHeight)
                .frame(maxWidth: .infinity, alignment: .center)
                .clipped()
        }
        .clipped()
    }

    private var placeholderView: some View {
        VStack(spacing: 12) {
            Image(systemName: post.type == .video ? "video.slash" : "photo.badge.exclamationmark")
                .font(.system(size: 48)).foregroundColor(.white.opacity(0.5))
            Text("Nie można załadować")
                .font(.caption).foregroundColor(.white.opacity(0.5))
        }
    }
}
