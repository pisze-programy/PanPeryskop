import SwiftUI
import Observation

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

    var onExit: (() -> Void)?

    static let longPressDuration: TimeInterval = 0.4
    static let flipDuration: Double = 0.1
    static let slideFraction: CGFloat = 0.35
    private static let photoSteps = 50

    private var photoTimer: Task<Void, Never>?
    private var flipTask: Task<Void, Never>?
    private var prefetchTask: Task<Void, Never>?

    init(posts: [Post], startIndex: Int, actions: StoryActions) {
        self.posts = posts
        self.actions = actions
        self.currentIndex = startIndex
        self.displayIndex = startIndex
    }

    var currentPost: Post {
        posts.indices.contains(displayIndex) ? posts[displayIndex] : posts[0]
    }

    var displayedPost: Post { currentPost }

    func onAppear() {
        photoTimer?.cancel()
        photoTimer = startPhotoTimer()
        prefetchNeighbors()
    }

    func onDisappear() {
        photoTimer?.cancel()
        flipTask?.cancel()
        prefetchTask?.cancel()
    }

    func prefetchNeighbors() {
        prefetchTask?.cancel()
        let urls = neighborThumbURLs()
        guard !urls.isEmpty else { return }
        prefetchTask = Task {
            await Self.prefetchURLs(urls)
        }
    }

    private static func prefetchURLs(_ urls: [URL]) async {
        var index = 0
        while index < urls.count, !Task.isCancelled {
            _ = await RemoteImageStore.shared.load(urls[index])
            index += 1
        }
    }

    private func neighborThumbURLs() -> [URL] {
        [1, -1].compactMap { neighborThumbURL(offset: $0) }
    }

    private func neighborThumbURL(offset: Int) -> URL? {
        let index = displayIndex + offset
        guard posts.indices.contains(index) else { return nil }
        let post = posts[index]
        guard let url = post.resolvedThumbURL, url != post.resolvedMediaURL else { return nil }
        return url
    }

    func pause() {
        paused = true
        photoTimer?.cancel()
    }

    func resume() {
        photoTimer?.cancel()
        paused = false
        photoTimer = startPhotoTimer()
    }

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
        flipTask?.cancel()
        prefetchTask?.cancel()
        onExit?()
    }

    private func startPhotoTimer() -> Task<Void, Never>? {
        guard !posts.isEmpty, !paused else { return nil }
        let post = currentPost
        let start = min(Int((progressFraction * Double(Self.photoSteps)).rounded(.down)), Self.photoSteps - 1)
        guard start < Self.photoSteps else { return nil }
        return Task { [weak self] in
            var step = start
            while step < Self.photoSteps, !Task.isCancelled, self != nil {
                try? await Task.sleep(nanoseconds: 100_000_000)
                self?.applyTimerTick(step)
                step += 1
            }
            self?.finishTimer(post)
        }
    }

    private func applyTimerTick(_ step: Int) {
        guard !Task.isCancelled else { return }
        progressFraction = Double(step) / Double(Self.photoSteps)
    }

    private func finishTimer(_ post: Post) {
        guard !Task.isCancelled else { return }
        handleStoryFinished(post)
    }

    func handleStoryFinished(_ post: Post) {
        guard post.id == currentPost.id else { return }
        markSeen(currentIndex)
        advanceOrExit()
    }

    func navigate(to newIndex: Int) {
        guard newIndex != currentIndex, posts.indices.contains(newIndex) else { return }
        let old = displayIndex
        flipTask?.cancel()
        photoTimer?.cancel()
        selectedShowtime = nil
        progressFraction = 0
        paused = false
        markSeen(old)
        currentIndex = newIndex
        let direction: CGFloat = newIndex > old ? 1 : -1

        withAnimation(.easeInOut(duration: Self.flipDuration)) {
            slideOffset = -direction * slideWidth * Self.slideFraction
        }
        flipTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.flipDuration / 2 * 1_000_000_000))
            guard let self, !Task.isCancelled else { return }
            self.completeNavigation(to: newIndex, direction: direction)
        }
    }

    private func completeNavigation(to newIndex: Int, direction: CGFloat) {
        displayIndex = newIndex
        slideOffset = direction * slideWidth * Self.slideFraction
        progressFraction = 0
        photoTimer?.cancel()
        photoTimer = paused ? nil : startPhotoTimer()
        prefetchNeighbors()
        withAnimation(.easeInOut(duration: Self.flipDuration)) {
            slideOffset = 0
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

    func navigationGesture(width: CGFloat, height: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { _ in
                self.handlePressChanged()
            }
            .onEnded { value in
                self.handlePressEnded(location: value.location, width: width, height: height)
            }
    }

    private func handlePressChanged() {
        guard !isPressing else { return }
        isPressing = true
        pressStart = Date()
        pause()
    }

    private func handlePressEnded(location: CGPoint, width: CGFloat, height: CGFloat) {
        isPressing = false
        let duration = Date().timeIntervalSince(pressStart)
        resume()
        guard duration < Self.longPressDuration else { return }
        guard abs(location.y - height / 2) <= height * 0.25 else { return }
        if location.x < width * 0.3 {
            goPrev()
        } else if location.x > width * 0.7 {
            goNext()
        }
    }

    private func markSeen(_ index: Int) {
        guard posts.indices.contains(index) else { return }
        let post = posts[index]
        guard loadedIDs.contains(post.id) else { return }
        Task { await actions.markWatched(post.id) }
    }

    func toggleLike(_ postId: String) {
        let current = likedStates[postId] ?? currentPost.liked
        if !current { Haptics.explosion() }
        Task { [weak self] in
            guard let self else { return }
            let result = await self.actions.toggleLike(postId)
            self.likedStates[postId] = result
        }
    }

    func toggleDislike(_ postId: String) {
        let base = dislikesCounts[postId] ?? currentPost.dislikes_count
        Task { [weak self] in
            guard let self else { return }
            let result = await self.actions.toggleDislike(postId)
            self.dislikedStates[postId] = result
            self.dislikesCounts[postId] = max(0, base + (result ? 1 : -1))
        }
    }
}