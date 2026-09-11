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
                // Thumb preview renders immediately (pixelated, no background, no
                // spinner); the full image + its background fade in once loaded.
                ZStack(alignment: .center) {
                    if post.hasThumb, let thumbURL = post.resolvedThumbURL {
                        AsyncImage(url: thumbURL) { tp in
                            switch tp {
                            case .success(let thumb):
                                photoLayout(thumb, withBg: false)
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
        } else {
            placeholderView
        }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
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
