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
    @State private var progressFraction: Double = 0
    @State private var likedStates: [String: Bool] = [:]
    @State private var dislikedStates: [String: Bool] = [:]
    @State private var dislikesCounts: [String: Int] = [:]
    @State private var shareItem: ShareItem?
    @State private var showReportDialog = false
    @State private var paused = false
    @State private var loadedIDs: Set<String> = []
    /// Random gradient generated once per preview open — stable while viewing.
    @State private var backgroundSeed = StoryGradientSeed.random()

    init(posts: [Post], startIndex: Int, isPresented: Binding<Bool>, viewModel: MapViewModel) {
        self.posts = posts
        self.startIndex = startIndex
        self._isPresented = isPresented
        self.viewModel = viewModel
        self._currentIndex = State(initialValue: startIndex)
    }

    var body: some View {
        ZStack {
            StoryMeshGradient(seed: backgroundSeed)

            LazyPager(data: posts, page: $currentIndex, direction: .vertical) { post in
                StoryContent(
                    post: post,
                    isActive: post.id == currentPost.id,
                    paused: $paused,
                    onLoaded: { loadedIDs.insert($0.id) },
                    onFinished: { handleStoryFinished(post) },
                    onProgress: { fraction in
                        if post.id == currentPost.id { progressFraction = fraction }
                    }
                )
            }
            .settings { $0.preloadAmount = 1; $0.overscrollThreshold = 0.05 }
            .onPress(
                started: { pausePlayback() },
                ended: { resumePlayback() }
            )
            .overscroll { position in
                if position == .beginning, currentIndex == 0 {
                    exitViewer()
                } else if position == .end, currentIndex == posts.count - 1 {
                    exitViewer()
                }
            }
            .ignoresSafeArea()
            .onChange(of: currentIndex) { oldIdx, newIdx in
                handlePageChange(old: oldIdx, new: newIdx)
            }

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
                        Menu {
                            Button {
                                pausePlayback()
                                showReportDialog = true
                            } label: {
                                Label("Zgłoś", systemImage: "flag")
                            }
                        } label: {
                            Image(systemName: "ellipsis")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(.white)
                                .frame(width: 40, height: 40)
                                .background(.ultraThinMaterial)
                                .clipShape(Circle())
                        }
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
                .background(alignment: .top) {
                    StoryBlurBar(bottomFade: true)
                        .frame(height: 190)
                }

                VStack {
                    Spacer()
                    bottomInfoCard
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16 + bottomSafeAreaInset)
                .overlay(alignment: .bottomTrailing) {
                    actionCapsule
                        .padding(.trailing, 24)
                        .padding(.bottom, 56)
                }
                .background(alignment: .bottom) {
                    StoryBlurBar(bottomFade: false)
                        .frame(height: 330)
                }
            }
        .ignoresSafeArea()
        .onAppear { photoTimer = startPhotoTimer() }
        .onDisappear { photoTimer?.cancel() }
        .sheet(item: $shareItem) { item in
            ActivityViewController(items: [item.text])
                .onDisappear { resumePlayback() }
        }
        .alert("Zgłosić treść?", isPresented: $showReportDialog) {
            Button("Zgłaszam", role: .destructive) { reportPost(reason: "inne") }
            Button("Anuluj", role: .cancel) { resumePlayback() }
        } message: {
            Text("Treść trafi do weryfikacji moderatora.")
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

    /// Sends a content report to the admin moderation queue. Reports never
    /// auto-block the content or the user — an admin decides.
    @MainActor
    private func reportPost(reason: String) {
        let postId = currentPost.id
        Task {
            defer { resumePlayback() }
            do {
                struct ReportBody: Encodable { let reason: String }
                struct ReportResponse: Decodable { let ok: Bool }
                let _: ReportResponse = try await APIClient.post("/reports/posts/\(postId)/report", body: ReportBody(reason: reason))
                ToastManager.shared.show("Dziękujemy za zgłoszenie")
            } catch {
                ToastManager.shared.show("Nie udało się wysłać zgłoszenia. Spróbuj ponownie.")
            }
        }
    }

    // MARK: - Bottom info cards

    /// Shared bottom card (events + live, same layout): blur background, title on top
    /// (events only), left = date + flip-clock (event start time or live publish time),
    /// right = venue + link (events) or avatar + nickname (live).
    private var bottomInfoCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            badgesRow

            if currentPost.isEvent {
                Text(currentPost.eventInfo.title)
                    .font(.headline)
                    .foregroundColor(.primary)
                    .lineLimit(2)
            }

            HStack(alignment: .bottom, spacing: 16) {
                VStack(alignment: .center, spacing: 6) {
                    Text(EventDateFormatter.eventDay(currentPost.created_at))
                        .font(.caption)
                        .fontWeight(.semibold)
                        .textCase(.uppercase)
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                    if let times = currentPost.showtimes, times.count > 1 {
                        ShowtimesPager(times: times)
                            .id(currentPost.id)
                    } else {
                        FlipClockTime(time: clockTime)
                            .frame(maxWidth: .infinity, alignment: .center)
                        // Reserve the dots row height so single-time cards don't
                        // jump between pager (with dots) and plain clock.
                        Spacer().frame(height: 11)
                    }
                }
                .frame(width: 168)

                if currentPost.isEvent {
                    eventDetails
                } else {
                    liveAuthor
                }

                Spacer(minLength: 0)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.25), lineWidth: 0.5)
        )
    }

    /// Home-indicator inset — the story preview ignores the safe area for the media,
    /// but the bottom info card must sit above the iOS bottom bar.
    private var bottomSafeAreaInset: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }?.safeAreaInsets.bottom ?? 0
    }

    /// Flip-clock value: the first structured showtime, else the event start time
    /// from the description (`--:--` if unknown) or the live post's publish time.
    private var clockTime: String {
        if let times = currentPost.showtimes, !times.isEmpty {
            return times[0]
        }
        if currentPost.isEvent {
            return currentPost.eventInfo.time ?? "--:--"
        }
        return EventDateFormatter.time(currentPost.created_at)
    }

    /// Events: venue above the link; both bottom-aligned with the flip-clock.
    private var eventDetails: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let venue = currentPost.eventInfo.venue {
                Label(venue, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
            if let link = currentPost.link_url, let url = URL(string: link) {
                Button {
                    UIApplication.shared.open(url)
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
        HStack(spacing: 8) {
            StoryAvatar(url: currentPost.author_avatar_url, size: 32)
            Text(currentPost.author_name)
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(.primary)
        }
    }

    private var badgesRow: some View {
        HStack(spacing: 6) {
            if currentPost.is_sponsored == true {
                Label("Sponsorowane", systemImage: "megaphone.fill")
                    .font(.caption2)
                    .foregroundColor(.orange)
            }
            if currentPost.is_sold_out == true {
                Label("Wyprzedane", systemImage: "xmark.circle.fill")
                    .font(.caption2)
                    .foregroundColor(.red)
            }
        }
    }

    /// Like / Dislike / Share capsule — kept in the hierarchy but hidden until the
    /// UI is reworked (rendered as an overlay so the info card stays full-width).
    private var actionCapsule: some View {
        VStack(spacing: 20) {
            let liked = likedStates[currentPost.id] ?? currentPost.liked
            FaveLikeButton(isLiked: liked) { newValue in
                if newValue { Haptics.explosion() }
                Task {
                    let result = await viewModel.toggleLike(currentPost.id)
                    likedStates[currentPost.id] = result
                }
            }
            let disliked = dislikedStates[currentPost.id] ?? currentPost.disliked
            let dislikeCount = dislikesCounts[currentPost.id] ?? currentPost.dislikes_count
            Button {
                Haptics.impact(.light)
                let base = dislikeCount
                Task {
                    let result = await viewModel.toggleDislike(currentPost.id)
                    dislikedStates[currentPost.id] = result
                    dislikesCounts[currentPost.id] = max(0, base + (result ? 1 : -1))
                }
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: disliked ? "hand.thumbsdown.fill" : "hand.thumbsdown")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundColor(disliked ? .red : .white)
                    if dislikeCount > 0 {
                        Text("\(dislikeCount)")
                            .font(.caption)
                            .foregroundColor(.white)
                    }
                }
                .frame(width: 56, height: 56)
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
            Button {
                Haptics.impact(.light)
                pausePlayback()
                Task { await viewModel.sharePost(currentPost.id) }
                shareItem = ShareItem(
                    id: currentPost.id,
                    text: "\(DeepLink.scheme)://\(DeepLink.host)/\(currentPost.id)"
                )
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: "arrowshape.turn.up.right.fill")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundColor(.white)
                    if currentPost.shares_count > 0 {
                        Text("\(currentPost.shares_count)")
                            .font(.caption)
                            .foregroundColor(.white)
                    }
                }
                .frame(width: 56, height: 56)
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 10)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
        .shadow(color: .black.opacity(0.2), radius: 8, x: 0, y: 4)
        .hidden()
    }

    private var currentPost: Post {
        posts.indices.contains(currentIndex) ? posts[currentIndex] : posts[0]
    }

    private func mediaURL(for post: Post) -> URL? {
        if let url = post.media_url { return URL(string: url) }
        if let key = post.media_key { return URL(string: "\(APIClient.baseURL)/media/\(key)") }
        return nil
    }

    private static let photoSteps = 50

    private func startPhotoTimer() -> Task<Void, Never>? {
        if posts.isEmpty || currentPost.type == .video { return nil }
        let post = currentPost
        let start = min(Int((progressFraction * Double(Self.photoSteps)).rounded(.down)), Self.photoSteps - 1)
        guard start < Self.photoSteps else { return nil }
        return Task {
            for step in start..<Self.photoSteps {
                try? await Task.sleep(nanoseconds: 100_000_000)
                guard !Task.isCancelled else { return }
                await MainActor.run { progressFraction = Double(step) / Double(Self.photoSteps) }
            }
            await MainActor.run { handleStoryFinished(post) }
        }
    }

    private func handleStoryFinished(_ post: Post) {
        guard post.id == currentPost.id else { return }
        markSeen(currentIndex)
        advanceOrExit()
    }

    private func handlePageChange(old: Int, new: Int) {
        photoTimer?.cancel()
        progressFraction = 0
        paused = false
        if old < new { markSeen(old) }
        let nxt = posts.indices.contains(new) ? posts[new] : nil
        if nxt?.type == .photo {
            photoTimer = startPhotoTimer()
        }
    }

    private func markSeen(_ index: Int) {
        guard posts.indices.contains(index) else { return }
        let post = posts[index]
        guard loadedIDs.contains(post.id) else { return }
        Task { await viewModel.markWatched(post.id) }
    }

    private func advanceOrExit() {
        let hasMore = currentIndex + 1 < posts.count
        if hasMore { currentIndex += 1 }
        else { exitViewer() }
    }

    private func exitViewer() {
        markSeen(currentIndex)
        photoTimer?.cancel()
        isPresented = false
    }
}

struct StoryContent: View {
    let post: Post
    let isActive: Bool
    @Binding var paused: Bool
    let onLoaded: (Post) -> Void
    let onFinished: () -> Void
    let onProgress: (Double) -> Void

    @State private var showThumb = true

    var body: some View {
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
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: .fit)
                        .onAppear { onLoaded(post) }
                case .failure:
                    placeholderView
                case .empty:
                    thumbPlaceholder
                @unknown default:
                    placeholderView
                }
            }
        } else {
            placeholderView
        }
    }

    private var thumbPlaceholder: some View {
        Group {
            if post.hasThumb, let thumbURL = post.resolvedThumbURL {
                AsyncImage(url: thumbURL) { tp in
                    switch tp {
                    case .success(let thumb):
                        thumb.resizable().aspectRatio(contentMode: .fit)
                    default:
                        ProgressView().tint(.white)
                    }
                }
            } else {
                ProgressView().tint(.white)
            }
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
    let isActive: Bool
    @Binding var paused: Bool
    let onFinished: () -> Void
    let onStarted: () -> Void
    let onReady: () -> Void
    let onProgress: (Double) -> Void
    @State private var player: AVPlayer?
    @State private var observer: Any?
    @State private var statusObserver: NSKeyValueObservation?
    @State private var timeObserver: NSKeyValueObservation?
    @State private var timeObserverToken: Any?
    @State private var didReportReady = false
    @State private var didReportStarted = false

    var body: some View {
        VideoPlayer(player: player)
            .onAppear {
                guard player == nil else { return }
                let p = AVPlayer(url: url)
                player = p
                observer = NotificationCenter.default.addObserver(
                    forName: .AVPlayerItemDidPlayToEndTime,
                    object: p.currentItem, queue: .main
                ) { _ in Task { @MainActor in onFinished() } }
                if let item = p.currentItem {
                    statusObserver = item.observe(\.status, options: [.initial, .new]) { item, _ in
                        DispatchQueue.main.async {
                            if item.status == .readyToPlay, !didReportReady {
                                didReportReady = true
                                onReady()
                            }
                        }
                    }
                }
                timeObserver = p.observe(\.timeControlStatus, options: [.new]) { player, _ in
                    DispatchQueue.main.async {
                        if player.timeControlStatus == .playing,
                           let item = player.currentItem,
                           item.isPlaybackLikelyToKeepUp,
                           !didReportStarted {
                            didReportStarted = true
                            onStarted()
                        }
                    }
                }
                let interval = CMTime(seconds: 0.25, preferredTimescale: 600)
                timeObserverToken = p.addPeriodicTimeObserver(
                    forInterval: interval, queue: .main
                ) { [weak p] time in
                    guard let p, let item = p.currentItem, item.duration.seconds > 0 else { return }
                    onProgress(min(max(time.seconds / item.duration.seconds, 0), 1))
                }
                if isActive && !paused { p.play() }
            }
            .onDisappear {
                teardown()
            }
            .onChange(of: isActive) { _, active in
                if active && !paused { player?.play() } else { player?.pause() }
            }
            .onChange(of: paused) { _, isPaused in
                if isPaused { player?.pause() } else if isActive { player?.play() }
            }
    }

    private func teardown() {
        player?.pause()
        if let token = timeObserverToken {
            player?.removeTimeObserver(token)
        }
        timeObserverToken = nil
        if let obs = observer {
            NotificationCenter.default.removeObserver(obs)
        }
        observer = nil
        statusObserver?.invalidate()
        statusObserver = nil
        timeObserver?.invalidate()
        timeObserver = nil
        player = nil
        didReportReady = false
        didReportStarted = false
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

enum StoryDateFormatter {
    static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "pl_PL")
        f.dateFormat = "d MMM HH:mm"
        return f
    }()

    static func format(_ ms: Int64) -> String {
        formatter.string(from: Date(timeIntervalSince1970: TimeInterval(ms) / 1000))
    }
}

/// Event day (the seed anchor is 06:00 Europe/Warsaw of the event date) — shown
/// as a small label above the flip-clock time.
enum EventDateFormatter {
    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "pl_PL")
        f.timeZone = TimeZone(identifier: "Europe/Warsaw")
        f.dateFormat = "EEE d MMM"
        return f
    }()

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "pl_PL")
        f.timeZone = TimeZone(identifier: "Europe/Warsaw")
        f.dateFormat = "HH:mm"
        return f
    }()

    static func eventDay(_ ms: Int64) -> String {
        dayFormatter.string(from: Date(timeIntervalSince1970: TimeInterval(ms) / 1000)).uppercased()
    }

    static func time(_ ms: Int64) -> String {
        timeFormatter.string(from: Date(timeIntervalSince1970: TimeInterval(ms) / 1000))
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
    @State private var page: Int?

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

            HStack(spacing: 6) {
                ForEach(times.indices, id: \.self) { i in
                    Circle()
                        .fill(i == (page ?? 0) ? Color.blue : Color.secondary.opacity(0.3))
                        .frame(width: 9, height: 9)
                }
            }
            .frame(maxWidth: .infinity, alignment: .center)
        }
    }
}

