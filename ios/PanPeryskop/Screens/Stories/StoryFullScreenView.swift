import SwiftUI
import AVKit
import Kingfisher
import LazyPager

struct StoryFullScreenView: View {
    let posts: [Post]
    let startIndex: Int
    @Binding var isPresented: Bool
    @ObservedObject var viewModel: MapViewModel

    @State private var currentIndex: Int
    @State private var opacity: CGFloat = 1
    @State private var photoTimer: Task<Void, Never>?
    @State private var videoFinished = false
    @State private var player: AVPlayer?

    init(posts: [Post], startIndex: Int, isPresented: Binding<Bool>, viewModel: MapViewModel) {
        self.posts = posts
        self.startIndex = startIndex
        self._isPresented = isPresented
        self.viewModel = viewModel
        self._currentIndex = State(initialValue: startIndex)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            LazyPager(data: posts, page: $currentIndex, direction: .vertical) { post in
                StoryContent(post: post, videoFinished: $videoFinished)
            }
            .zoomable(min: 1, max: 3)
            .onDismiss(backgroundOpacity: $opacity) {
                exitViewer()
            }
            .ignoresSafeArea()
            .onChange(of: currentIndex) { newIdx in
                handlePageChange(old: currentIndex, new: newIdx)
            }
            .onChange(of: videoFinished) { finished in
                if finished {
                    markCurrentWatched()
                    advanceOrExit()
                }
            }
            .onTap {
                hideUI.toggle()
            }

            if !hideUI {
                VStack {
                    HStack(spacing: 4) {
                        ForEach(posts.indices, id: \.self) { idx in
                            ProgressBar(fraction: idx == currentIndex ? progressFraction : (idx < currentIndex ? 1 : 0))
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                    Spacer()
                }

                VStack {
                    Spacer()
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(currentPost.description)
                                .font(.callout)
                                .foregroundColor(.white)
                            Text(currentPost.author_name)
                                .font(.caption)
                                .foregroundColor(.white.opacity(0.7))
                        }
                        Spacer()
                        VStack(spacing: 20) {
                            ActionButton(icon: currentPost.liked ? "heart.fill" : "heart",
                                         count: currentPost.liked ? currentPost.likes_count + 1 : currentPost.likes_count,
                                         color: currentPost.liked ? .red : .white) {
                                Task {
                                    let liked = await viewModel.toggleLike(currentPost.id)
                                }
                            }
                            ActionButton(icon: "arrowshape.turn.up.right.fill", count: currentPost.shares_count, color: .white) {
                                Task { await viewModel.sharePost(currentPost.id) }
                            }
                            ActionButton(icon: "eye.fill", count: currentPost.views_count, color: .white) {}
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 40)
                }
            }
        }
        .onAppear { photoTimer = startPhotoTimer() }
        .onDisappear { photoTimer?.cancel(); player = nil }
    }

    @State private var hideUI = false
    @State private var progressFraction: Double = 0

    private var currentPost: Post {
        posts[safe: currentIndex] ?? posts[0]
    }

    private func startPhotoTimer() -> Task<Void, Never>? {
        if posts.isEmpty || currentPost.type == .video { return nil }
        return Task {
            let duration: Double = 6
            for step in 0...Int(duration * 10) {
                try? await Task.sleep(nanoseconds: 100_000_000)
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    progressFraction = Double(step) / (duration * 10)
                }
            }
            await MainActor.run {
                videoFinished = true
            }
        }
    }

    private func handlePageChange(old: Int, new: Int) {
        photoTimer?.cancel()
        progressFraction = 0
        videoFinished = false
        if old < new { markWatched(old) }
        if new == posts.count - 1 {
            advanceOrExit()
        }
        if new < posts.count, posts[new].type == .photo || posts[new].type == .text {
            photoTimer = startPhotoTimer()
        }
    }

    private func markCurrentWatched() {
        guard currentIndex < posts.count else { return }
        Task { await viewModel.markWatched(posts[currentIndex].id) }
    }

    private func markWatched(_ index: Int) {
        guard index < posts.count else { return }
        Task { await viewModel.markWatched(posts[index].id) }
    }

    private func advanceOrExit() {
        if currentIndex + 1 < posts.count {
            currentIndex += 1
        } else {
            exitViewer()
        }
    }

    private func exitViewer() {
        photoTimer?.cancel()
        isPresented = false
    }
}

struct StoryContent: View {
    let post: Post
    @Binding var videoFinished: Bool

    var body: some View {
        GeometryReader { geo in
            if post.type == .video, let url = post.media_url, let videoURL = URL(string: url) {
                StoryVideoPlayer(url: videoURL, finished: $videoFinished)
            } else if let media = post.media_url, let url = URL(string: media) {
                KFImage(url)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else if post.type == .text {
                Text(post.description)
                    .font(.title2)
                    .foregroundColor(.white)
                    .padding()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                Image(systemName: "photo")
                    .font(.largeTitle)
                    .foregroundColor(.gray)
            }
        }
    }
}

struct StoryVideoPlayer: View {
    let url: URL
    @Binding var finished: Bool
    @State private var player: AVPlayer?
    @State private var observer: Any?

    var body: some View {
        VideoPlayer(player: player)
            .onAppear {
                let p = AVPlayer(url: url)
                p.play()
                player = p
                observer = NotificationCenter.default.addObserver(
                    forName: .AVPlayerItemDidPlayToEndTime,
                    object: p.currentItem,
                    queue: .main
                ) { _ in
                    finished = true
                }
            }
            .onDisappear {
                player?.pause()
                if let obs = observer {
                    NotificationCenter.default.removeObserver(obs)
                }
            }
    }
}

struct ActionButton: View {
    let icon: String
    let count: Int
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundColor(color)
                Text(count > 0 ? "\(count)" : "")
                    .font(.caption2)
                    .foregroundColor(.white)
            }
        }
    }
}

struct ProgressBar: View {
    let fraction: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.3))
                Capsule()
                    .fill(Color.white)
                    .frame(width: geo.size.width * fraction)
            }
        }
        .frame(height: 3)
    }
}

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
