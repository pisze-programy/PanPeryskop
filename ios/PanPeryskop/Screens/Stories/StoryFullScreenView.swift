import SwiftUI
import AVKit
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

    @State private var isPressing = false
    @State private var pressStart = Date()
    /// Showtime chosen in the pager — drives which booking deep-link opens.
    @State private var selectedShowtime: String?
    /// What is currently rendered; updated at the slide midpoint (swap).
    @State private var displayIndex: Int
    /// Manual horizontal slide offset: current page slides out to the edge, the new
    /// one slides in from the opposite edge. Always correct across rapid direction
    /// changes.
    @State private var slideOffset: CGFloat = 0
    @State private var slideWidth: CGFloat = 400
    @State private var flipTask: Task<Void, Never>?

    private static let longPressDuration: TimeInterval = 0.4
    private static let flipDuration: Double = 0.1
    /// Fraction of the screen width the story travels on next/prev — short, snappy.
    private static let slideFraction: CGFloat = 0.35

    init(posts: [Post], startIndex: Int, isPresented: Binding<Bool>, viewModel: MapViewModel) {
        self.posts = posts
        self.startIndex = startIndex
        self._isPresented = isPresented
        self.viewModel = viewModel
        self._currentIndex = State(initialValue: startIndex)
        self._displayIndex = State(initialValue: startIndex)
    }

    var body: some View {
        ZStack {
            StoryMeshGradient(seed: backgroundSeed)

            GeometryReader { geo in
                ZStack {
                    StoryContent(
                        post: displayedPost,
                        isActive: slideOffset == 0,
                        paused: $paused,
                        onLoaded: { loadedIDs.insert($0.id) },
                        onFinished: { handleStoryFinished(displayedPost) },
                        onProgress: { progressFraction = $0 }
                    )
                    .id(displayedPost.id)
                    .transition(.identity)
                    .modifier(StorySlideModifier(offset: slideOffset))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
                .gesture(navigationGesture(width: geo.size.width, height: geo.size.height))
                .onAppear { slideWidth = geo.size.width }
            }
            .ignoresSafeArea()

            VStack {
                HStack {
                    Button {
                        Haptics.selection()
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
                        if !currentPost.isEvent {
                            Menu {
                                Button {
                                    pausePlayback()
                                    // Defer until the menu has fully dismissed — presenting
                                    // an alert straight from a Menu item is flaky on iOS.
                                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                                        showReportDialog = true
                                    }
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
                            .simultaneousGesture(TapGesture().onEnded { Haptics.selection() })
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
                .padding(.top, topSafeAreaInset + 12)
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

            HStack(alignment: currentPost.isEvent ? .bottom : .center, spacing: 16) {
                VStack(alignment: .center, spacing: 6) {
                    Text(EventDateFormatter.eventDay(currentPost.created_at))
                        .font(.caption)
                        .fontWeight(.semibold)
                        .textCase(.uppercase)
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                    if let times = currentPost.showtimes, times.count > 1 {
                        ShowtimesPager(times: times) { interacting in
                            if interacting {
                                // User is checking showtimes — hold the story timer.
                                pausePlayback()
                            } else {
                                // Done: reset so the story doesn't auto-advance.
                                photoTimer?.cancel()
                                progressFraction = 0
                                resumePlayback()
                            }
                        } onSelect: { time in
                            selectedShowtime = time
                        }
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

    /// Status-bar / Dynamic Island inset — the top bar (and its ··· Menu) must sit
    /// below it so the dropdown anchors in a tappable region.
    private var topSafeAreaInset: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }?.safeAreaInsets.top ?? 0
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

    /// The pager selection, only if it still belongs to the current post's showtimes
    /// (the selection resets when the user navigates to a different story).
    private var effectiveShowtime: String? {
        guard let sel = selectedShowtime, let times = currentPost.showtimes, times.contains(sel) else { return nil }
        return sel
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
            // Deep-link to the showtime selected in the pager (default: first);
            // fall back to the event page link when the post has no booking.
            if let url = currentPost.bookingURL(for: effectiveShowtime ?? clockTime) ?? currentPost.link_url.flatMap(URL.init) {
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
        posts.indices.contains(displayIndex) ? posts[displayIndex] : posts[0]
    }

    /// The post currently rendered (the flip midpoint swaps displayIndex).
    private var displayedPost: Post { currentPost }

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

    private func navigate(to newIndex: Int) {
        guard newIndex != displayIndex, posts.indices.contains(newIndex) else { return }
        let old = displayIndex
        flipTask?.cancel()
        photoTimer?.cancel()
        progressFraction = 0
        paused = false
        markSeen(old)
        currentIndex = newIndex
        let direction: CGFloat = newIndex > old ? 1 : -1

        // Slide the current page out to the edge, swap at the midpoint, then slide
        // the new page in from the opposite edge — direction-safe on rapid taps.
        withAnimation(.easeInOut(duration: Self.flipDuration)) {
            slideOffset = -direction * slideWidth * Self.slideFraction
        }
        flipTask = Task {
            try? await Task.sleep(nanoseconds: UInt64(Self.flipDuration / 2 * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                displayIndex = newIndex
                slideOffset = direction * slideWidth * Self.slideFraction
                // Fresh timer: reset progress so the new story starts from zero even
                // if the outgoing content fed onProgress during the slide-out.
                progressFraction = 0
                if currentPost.type == .photo { photoTimer = startPhotoTimer() }
                withAnimation(.easeInOut(duration: Self.flipDuration)) { slideOffset = 0 }
            }
        }
    }

    private func goNext() {
        Haptics.impact(.rigid)
        if currentIndex + 1 < posts.count {
            navigate(to: currentIndex + 1)
        } else {
            exitViewer()
        }
    }

    private func goPrev() {
        Haptics.impact(.medium)
        if currentIndex - 1 >= 0 {
            navigate(to: currentIndex - 1)
        } else {
            exitViewer()
        }
    }

    /// Tap zones: only the left/right corners in a ±25% vertical band from the
    /// center navigate; a long press pauses playback and its release never
    /// navigates — only a quick tap does.
    private func navigationGesture(width: CGFloat, height: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { _ in
                if !isPressing {
                    isPressing = true
                    pressStart = Date()
                    pausePlayback()
                }
            }
            .onEnded { value in
                isPressing = false
                let duration = Date().timeIntervalSince(pressStart)
                resumePlayback()
                guard duration < Self.longPressDuration else { return }
                guard abs(value.location.y - height / 2) <= height * 0.25 else { return }
                if value.location.x < width * 0.3 {
                    goPrev()
                } else if value.location.x > width * 0.7 {
                    goNext()
                }
            }
    }

    private func markSeen(_ index: Int) {
        guard posts.indices.contains(index) else { return }
        let post = posts[index]
        guard loadedIDs.contains(post.id) else { return }
        Task { await viewModel.markWatched(post.id) }
    }

    private func advanceOrExit() {
        if currentIndex + 1 < posts.count {
            navigate(to: currentIndex + 1)
        } else {
            exitViewer()
        }
    }

    private func exitViewer() {
        markSeen(currentIndex)
        photoTimer?.cancel()
        isPresented = false
    }
}

/// Simple horizontal slide for the story media — the current page slides out to
/// the edge, the new one slides in from the opposite edge (left/right).
struct StorySlideModifier: ViewModifier {
    let offset: CGFloat

    func body(content: Content) -> some View {
        content
            .offset(x: offset)
            .shadow(color: .black.opacity(abs(offset) > 1 ? 0.25 : 0), radius: 12)
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
                let frameHeight = UIScreen.main.bounds.height * 0.7
                let frameWidth = frameHeight * 9 / 16
                
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        ZStack(alignment: .center) {
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                                .frame(width: UIScreen.main.bounds.width, height: UIScreen.main.bounds.height)
                                .clipped()
                                .blur(radius: 12)
                                .opacity(0.8)
                                .scaleEffect(1.05)

                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                                .frame(width: frameWidth, height: frameHeight)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .clipped()
                        }
                        .clipped()
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
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
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

