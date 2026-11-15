import SwiftUI

struct StoryFullScreenView: View {
    @Binding var isPresented: Bool
    let actions: StoryActions
    @Environment(\.colorScheme) private var systemScheme
    @State private var vm: StoryViewModel

    @State private var shareItem: ShareItem?
    @State private var backgroundSeed = StoryGradientSeed.random()
    @State private var browserURL: URL?
    @State private var browserAllowAnyHost = false
    @State private var showBrowser = false
    @State private var browserOffset: CGFloat = 0
    @State private var browserAnimationTask: Task<Void, Never>?

    init(posts: [Post], startIndex: Int, isPresented: Binding<Bool>, actions: StoryActions) {
        self._isPresented = isPresented
        self.actions = actions
        self._vm = State(initialValue: StoryViewModel(posts: posts, startIndex: startIndex, actions: actions))
    }

    var body: some View {
        @Bindable var vm = vm
        return ZStack {
            StoryMeshGradient(seed: backgroundSeed)

            GeometryReader { geo in
                ZStack {
                    StoryContent(
                        post: vm.displayedPost,
                        topInset: topSafeAreaInset,
                        onLoaded: { vm.loadedIDs.insert($0.id) }
                    )
                    .id(vm.displayedPost.id)
                    .transition(.identity)
                    .modifier(StorySlideModifier(offset: vm.slideOffset))
                    .environment(\.colorScheme, cardScheme)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
                .gesture(vm.navigationGesture(width: geo.size.width, height: geo.size.height))
                .onAppear { vm.slideWidth = geo.size.width }
            }
            .ignoresSafeArea()

            StoryTopBar(
                posts: vm.posts,
                currentIndex: vm.currentIndex,
                progressFraction: vm.progressFraction,
                topInset: topSafeAreaInset,
                onClose: { vm.exit() }
            )

            VStack {
                Spacer()
                StoryInfoCard(
                    post: vm.currentPost,
                    tags: actions.tags,
                    selectedShowtime: $vm.selectedShowtime,
                    onPagerInteracting: { vm.pagerInteracting($0) },
                    onOpenBrowser: openBrowser
                )
                .environment(\.colorScheme, cardScheme)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.bottom, Theme.Spacing.l + bottomSafeAreaInset)
            .overlay(alignment: .bottomTrailing) {
                actionCapsule
                    .padding(.trailing, Theme.Spacing.xl)
                    .padding(.bottom, 56)
            }
            .background(alignment: .bottom) {
                StoryBlurBar(bottomFade: false)
                    .frame(height: 330)
            }

            if showBrowser, let url = browserURL {
                StoryBrowserOverlay(url: url, offset: browserOffset, bottomInset: bottomSafeAreaInset, allowAnyHost: browserAllowAnyHost, onClose: closeBrowser)
            }
        }
        .ignoresSafeArea()
        .onAppear {
            vm.onExit = { isPresented = false }
            vm.onAppear()
        }
        .onDisappear {
            browserAnimationTask?.cancel()
            vm.onDisappear()
        }
        .onChange(of: showBrowser) { _, open in
            open ? vm.pause() : vm.resume()
        }
        .sheet(item: $shareItem) { item in
            ActivityViewController(items: [item.text])
                .onDisappear { vm.resume() }
        }
    }

    private var cardScheme: ColorScheme {
        vm.currentPost.usesPhotoMask ? .dark : systemScheme
    }

    private var keyWindowSafeAreaInsets: UIEdgeInsets {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }?.safeAreaInsets ?? .zero
    }

    private var bottomSafeAreaInset: CGFloat {
        keyWindowSafeAreaInsets.bottom
    }

    private var topSafeAreaInset: CGFloat {
        keyWindowSafeAreaInsets.top
    }

    private func openBrowser(_ url: URL, allowAnyHost: Bool) {
        browserAnimationTask?.cancel()
        browserAllowAnyHost = allowAnyHost
        browserURL = url
        showBrowser = true
        browserOffset = StoryBrowserOverlay.panelHeight
        browserAnimationTask = Task { @MainActor in
            await Task.yield()
            guard !Task.isCancelled else { return }
            withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) {
                browserOffset = 0
            }
        }
    }

    private func closeBrowser() {
        browserAnimationTask?.cancel()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) {
            browserOffset = StoryBrowserOverlay.panelHeight
        }
        browserAnimationTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 280_000_000)
            guard !Task.isCancelled else { return }
            showBrowser = false
            browserOffset = 0
        }
    }

    private var actionCapsule: some View {
        VStack(spacing: 20) {
            FaveLikeButton(isLiked: vm.likedStates[vm.currentPost.id] ?? vm.currentPost.liked) { _ in
                vm.toggleLike(vm.currentPost.id)
            }
            dislikeButton
            shareButton
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 10)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
        .shadow(color: .black.opacity(0.2), radius: 8, x: 0, y: 4)
        .hidden()
    }

    private var dislikeButton: some View {
        let disliked = vm.dislikedStates[vm.currentPost.id] ?? vm.currentPost.disliked
        let count = vm.dislikesCounts[vm.currentPost.id] ?? vm.currentPost.dislikes_count
        return Button {
            Haptics.impact(.light)
            vm.toggleDislike(vm.currentPost.id)
        } label: {
            actionButtonLabel(
                icon: disliked ? "hand.thumbsdown.fill" : "hand.thumbsdown",
                color: disliked ? .red : .white,
                count: count
            )
        }
        .buttonStyle(.plain)
    }

    private var shareButton: some View {
        Button {
            Haptics.impact(.light)
            vm.pause()
            Task { await actions.sharePost(vm.currentPost.id) }
            shareItem = ShareItem(
                id: vm.currentPost.id,
                text: "\(DeepLink.scheme)://\(DeepLink.host)/\(vm.currentPost.id)"
            )
        } label: {
            actionButtonLabel(
                icon: "arrowshape.turn.up.right.fill",
                color: .white,
                count: vm.currentPost.shares_count
            )
        }
        .buttonStyle(.plain)
    }

    private func actionButtonLabel(icon: String, color: Color, count: Int) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 26, weight: .semibold))
                .foregroundColor(color)
            if count > 0 {
                Text("\(count)")
                    .font(.caption)
                    .foregroundColor(.white)
            }
        }
        .frame(width: 56, height: 56)
        .contentShape(Circle())
    }
}