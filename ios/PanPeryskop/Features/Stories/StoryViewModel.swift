import SwiftUI
import Observation

/// Playback + navigation + engagement state for the story viewer. Owns the timer,
/// the slide/flip transition, like/dislike and reporting; the view stays a thin
/// renderer over this.
@Observable
@MainActor
final class StoryViewModel {
    let posts: [Post]
    let actions: StoryActions

    private(set) var currentIndex: Int
    private(set) var displayIndex: Int
    var progressFraction: Double = 0
    var paused = false
    var selectedShowtime: String?
    var loadedIDs: Set<String> = []
    var slideOffset: CGFloat = 0
    var slideWidth: CGFloat = 400
    var isPressing = false
    var pressStart = Date()

    var likedStates: [String: Bool] = [:]
    var dislikedStates: [String: Bool] = [:]
    var dislikesCounts: [String: Int] = [:]

    /// Called when the viewer should close (back button, last story, empty tap).
    var onExit: (() -> Void)?

    static let longPressDuration: TimeInterval = 0.4
    static let flipDuration: Double = 0.1
    /// Fraction of the screen width the story travels on next/prev — short, snappy.
    static let slideFraction: CGFloat = 0.35
    private static let photoSteps = 50

    private var photoTimer: Task<Void, Never>?
    private var flipTask: Task<Void, Never>?

    init(posts: [Post], startIndex: Int, actions: StoryActions) {
        self.posts = posts
        self.actions = actions
        self.currentIndex = startIndex
        self.displayIndex = startIndex
    }

    // MARK: - Derived

    var currentPost: Post {
        posts.indices.contains(displayIndex) ? posts[displayIndex] : posts[0]
    }

    /// The post currently rendered (the flip midpoint swaps displayIndex).
    var displayedPost: Post { currentPost }

    // MARK: - Lifecycle

    func onAppear() { photoTimer = startPhotoTimer() }
    func onDisappear() { photoTimer?.cancel() }

    func pause() {
        paused = true
        photoTimer?.cancel()
    }

    func resume() {
        paused = false
        if currentPost.type != .video { photoTimer = startPhotoTimer() }
    }

    /// The showtime pager is being used → hold/resume the story timer.
    func pagerInteracting(_ interacting: Bool) {
        if interacting {
            pause()
        } else {
            photoTimer?.cancel()
            progressFraction = 0
            resume()
        }
    }

    func exit() {
        markSeen(currentIndex)
        photoTimer?.cancel()
        onExit?()
    }

    // MARK: - Timer

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

    func handleStoryFinished(_ post: Post) {
        guard post.id == currentPost.id else { return }
        markSeen(currentIndex)
        advanceOrExit()
    }

    // MARK: - Navigation

    func navigate(to newIndex: Int) {
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

    func goNext() {
        Haptics.impact(.rigid)
        if currentIndex + 1 < posts.count {
            navigate(to: currentIndex + 1)
        } else {
            exit()
        }
    }

    func goPrev() {
        Haptics.impact(.medium)
        if currentIndex - 1 >= 0 {
            navigate(to: currentIndex - 1)
        } else {
            exit()
        }
    }

    func advanceOrExit() {
        if currentIndex + 1 < posts.count {
            navigate(to: currentIndex + 1)
        } else {
            exit()
        }
    }

    /// Tap zones: only the left/right corners in a ±25% vertical band from the
    /// center navigate; a long press pauses playback and its release never
    /// navigates — only a quick tap does.
    func navigationGesture(width: CGFloat, height: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { _ in
                if !self.isPressing {
                    self.isPressing = true
                    self.pressStart = Date()
                    self.pause()
                }
            }
            .onEnded { value in
                self.isPressing = false
                let duration = Date().timeIntervalSince(self.pressStart)
                self.resume()
                guard duration < Self.longPressDuration else { return }
                guard abs(value.location.y - height / 2) <= height * 0.25 else { return }
                if value.location.x < width * 0.3 {
                    self.goPrev()
                } else if value.location.x > width * 0.7 {
                    self.goNext()
                }
            }
    }

    private func markSeen(_ index: Int) {
        guard posts.indices.contains(index) else { return }
        let post = posts[index]
        guard loadedIDs.contains(post.id) else { return }
        Task { await actions.markWatched(post.id) }
    }

    // MARK: - Engagement

    func toggleLike(_ postId: String) {
        let current = likedStates[postId] ?? currentPost.liked
        if !current { Haptics.explosion() }
        Task {
            let result = await actions.toggleLike(postId)
            likedStates[postId] = result
        }
    }

    func toggleDislike(_ postId: String) {
        let base = dislikesCounts[postId] ?? currentPost.dislikes_count
        Task {
            let result = await actions.toggleDislike(postId)
            dislikedStates[postId] = result
            dislikesCounts[postId] = max(0, base + (result ? 1 : -1))
        }
    }

    /// Sends a content report to the admin moderation queue. Reports never
    /// auto-block the content or the user — an admin decides.
    func reportPost(reason: String) {
        let postId = currentPost.id
        Task {
            defer { resume() }
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
}