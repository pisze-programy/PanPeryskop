import SwiftUI
import AVKit
import LazyPager
struct StoryFullScreenView: View {
    let posts: [Post]
    let startIndex: Int
    @Binding var isPresented: Bool
    @ObservedObject var viewModel: MapViewModel

    @State private var currentIndex: Int
    @State private var photoTimer: Task<Void, Never>?
    @State private var videoFinished = false
    @State private var hideUI = false
    @State private var progressFraction: Double = 0
    @State private var likedStates: [String: Bool] = [:]
    @State private var shareItem: ShareItem?
    @State private var paused = false

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
                StoryContent(post: post, videoFinished: $videoFinished, paused: $paused)
            }
            .onTap { hideUI.toggle() }
            .zoomable(min: 1, max: 3)
            .overscroll { position in
                if position == .beginning, currentIndex == 0 {
                    exitViewer()
                } else if position == .end, currentIndex == posts.count - 1 {
                    exitViewer()
                }
            }
            .ignoresSafeArea()
            .onChange(of: currentIndex) { _, newIdx in
                handlePageChange(old: currentIndex, new: newIdx)
            }
            .onChange(of: videoFinished) { _, finished in
                if finished { markCurrentWatched(); advanceOrExit() }
            }

            if !hideUI {
                VStack {
                    HStack {
                        Button {
                            exitViewer()
                        } label: {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(.white)
                                .frame(width: 40, height: 40)
                                .background(.ultraThinMaterial)
                                .clipShape(Circle())
                        }
                        Spacer()
                    }
                    .padding(.horizontal, 16)

                    HStack(spacing: 4) {
                        ForEach(posts.indices, id: \.self) { idx in
                            ProgressBar(fraction: idx == currentIndex ? progressFraction : (idx < currentIndex ? 1 : 0))
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 16)
                    Spacer()
                }
                .padding(.top, 56)

                VStack {
                    Spacer()
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 6) {
                                if isPending(currentPost) {
                                    Image(systemName: "lock.fill")
                                        .font(.caption2)
                                        .foregroundColor(.orange)
                                    Text("Weryfikacja")
                                        .font(.caption)
                                        .foregroundColor(.orange)
                                }
                            }
                            Text(currentPost.description)
                                .font(.callout)
                                .foregroundColor(.white)
                            HStack(spacing: 6) {
                                StoryAvatar(url: currentPost.author_avatar_url, size: 20)
                                Text(currentPost.author_name)
                                    .font(.caption)
                                    .foregroundColor(.white.opacity(0.7))
                                Text("·")
                                    .font(.caption)
                                    .foregroundColor(.white.opacity(0.5))
                                Text(StoryDateFormatter.format(currentPost.created_at))
                                    .font(.caption)
                                    .foregroundColor(.white.opacity(0.5))
                            }
                        }
                        Spacer()
                        VStack(spacing: 32) {
                            let liked = likedStates[currentPost.id] ?? currentPost.liked
                            ActionButton(icon: liked ? "heart.fill" : "heart",
                                         count: liked ? currentPost.likes_count + 1 : currentPost.likes_count,
                                         color: liked ? .red : .white) {
                                Task {
                                    let result = await viewModel.toggleLike(currentPost.id)
                                    likedStates[currentPost.id] = result
                                }
                            }
                            Button {
                                pausePlayback()
                                Task { await viewModel.sharePost(currentPost.id) }
                                shareItem = ShareItem(
                                    id: currentPost.id,
                                    text: "\(DeepLink.scheme)://\(DeepLink.host)/\(currentPost.id)"
                                )
                            } label: {
                                VStack(spacing: 4) {
                                    Image(systemName: "arrowshape.turn.up.right.fill")
                                        .font(.title2)
                                        .foregroundColor(.white)
                                    if currentPost.shares_count > 0 {
                                        Text("\(currentPost.shares_count)")
                                            .font(.caption)
                                            .foregroundColor(.white)
                                    }
                                }
                                .frame(width: 42, height: 42)
                                .background(.ultraThinMaterial)
                                .clipShape(Circle())
                            }
                            ActionButton(icon: "eye.fill", count: currentPost.views_count, color: .white) {}
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 80)
                }
            }
        }
        .onAppear { photoTimer = startPhotoTimer() }
        .onDisappear { photoTimer?.cancel() }
        .sheet(item: $shareItem) { item in
            ActivityViewController(items: [item.text])
                .onDisappear { resumePlayback() }
        }
    }

    private func pausePlayback() {
        paused = true
        photoTimer?.cancel()
    }

    private func resumePlayback() {
        paused = false
        if currentPost.type != .video {
            photoTimer = startPhotoTimer()
        }
    }

    private var currentPost: Post {
        posts.indices.contains(currentIndex) ? posts[currentIndex] : posts[0]
    }

    private func isPending(_ post: Post) -> Bool {
        PendingStore.shared.posts.map(\.id).contains(post.id)
    }

    private func mediaURL(for post: Post) -> URL? {
        if let url = post.media_url { return URL(string: url) }
        if let key = post.media_key { return URL(string: "\(APIClient.baseURL)/media/\(key)") }
        return nil
    }

    private func startPhotoTimer() -> Task<Void, Never>? {
        if posts.isEmpty || currentPost.type == .video { return nil }
        return Task {
            for step in 0...60 {
                try? await Task.sleep(nanoseconds: 100_000_000)
                guard !Task.isCancelled else { return }
                await MainActor.run { progressFraction = Double(step) / 60.0 }
            }
            await MainActor.run { videoFinished = true }
        }
    }

    private func handlePageChange(old: Int, new: Int) {
        photoTimer?.cancel()
        progressFraction = 0
        videoFinished = false
        paused = false
        if old < new { markWatched(old) }
        let nxt = posts.indices.contains(new) ? posts[new] : nil
        if nxt?.type == .photo || nxt?.type == .text {
            photoTimer = startPhotoTimer()
        }
    }

    private func markCurrentWatched() {
        guard currentIndex < posts.count else { return }
        let post = posts[currentIndex]
        guard !isPending(post) else {
            advanceOrExit()
            return
        }
        Task { await viewModel.markWatched(post.id) }
    }

    private func markWatched(_ index: Int) {
        guard index < posts.count else { return }
        let post = posts[index]
        guard !isPending(post) else { return }
        Task { await viewModel.markWatched(post.id) }
    }

    private func advanceOrExit() {
        let pendingRemaining = posts.indices.contains(currentIndex + 1) && !isPending(posts[currentIndex + 1])
        let hasMore = currentIndex + 1 < posts.count
        if hasMore { currentIndex += 1 }
        else { exitViewer() }
    }

    private func exitViewer() {
        photoTimer?.cancel()
        isPresented = false
    }
}

struct StoryContent: View {
    let post: Post
    @Binding var videoFinished: Bool
    @Binding var paused: Bool

    var body: some View {
        if post.type == .video, let url = post.resolvedMediaURL {
            StoryVideoPlayer(url: url, finished: $videoFinished, paused: $paused)
        } else if let url = post.resolvedMediaURL {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: .fit)
                case .failure:
                    placeholderView
                case .empty:
                    ProgressView().tint(.white)
                @unknown default:
                    placeholderView
                }
            }
        } else if post.type == .text {
            Text(post.description)
                .font(.title2).foregroundColor(.white).padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            placeholderView
        }
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

struct StoryVideoPlayer: View {
    let url: URL
    @Binding var finished: Bool
    @Binding var paused: Bool
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
                    object: p.currentItem, queue: .main
                ) { _ in Task { @MainActor in finished = true } }
            }
            .onDisappear {
                player?.pause()
                if let obs = observer { NotificationCenter.default.removeObserver(obs) }
            }
            .onChange(of: paused) { _, isPaused in
                if isPaused { player?.pause() } else { player?.play() }
            }
    }
}

struct ActionButton: View {
    let icon: String
    let count: Int
    let color: Color
    let action: (() -> Void)?

    init(icon: String, count: Int, color: Color, action: (() -> Void)? = nil) {
        self.icon = icon
        self.count = count
        self.color = color
        self.action = action
    }

    var body: some View {
        if let action {
            Button(action: action) { label }
        } else {
            label
        }
    }

    private var label: some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(color)
                .frame(width: 42, height: 42)
                .background(.ultraThinMaterial)
                .clipShape(Circle())
            if count > 0 {
                Text("\(count)").font(.caption).foregroundColor(.white)
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
                Capsule().fill(Color.white).frame(width: geo.size.width * fraction)
            }
        }
        .frame(height: 3)
    }
}

struct ActivityViewController: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

struct ShareItem: Identifiable {
    let id: String
    let text: String
}

enum DeepLink {
    static let scheme = "panperyskop"
    static let host = "story"

    static func storyURL(id: String) -> String {
        "\(scheme)://\(host)/\(id)"
    }

    static func storyId(from url: URL) -> String? {
        guard let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
              comps.scheme == scheme, comps.host == host else { return nil }
        return comps.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }
}
