import SwiftUI

struct StoryFullScreenView: View {
    @Binding var isPresented: Bool
    let actions: StoryActions
    @State private var vm: StoryViewModel

    /// UI-only state (presentation surfaces), kept out of the view model.
    @State private var shareItem: ShareItem?
    @State private var showReportDialog = false
    /// Random gradient generated once per preview open — stable while viewing.
    @State private var backgroundSeed = StoryGradientSeed.random()
    @State private var browserURL: URL?
    @State private var showBrowser = false
    @State private var browserOffset: CGFloat = 0

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
                        isActive: vm.slideOffset == 0,
                        paused: $vm.paused,
                        onLoaded: { vm.loadedIDs.insert($0.id) },
                        onFinished: { vm.handleStoryFinished(vm.displayedPost) },
                        onProgress: { vm.progressFraction = $0 }
                    )
                    .id(vm.displayedPost.id)
                    .transition(.identity)
                    .modifier(StorySlideModifier(offset: vm.slideOffset))
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
                showsMenu: !vm.currentPost.isEvent,
                topInset: topSafeAreaInset,
                onClose: {
                    Haptics.selection()
                    vm.exit()
                },
                onReport: {
                    vm.pause()
                    // Defer until the menu has fully dismissed — presenting an alert
                    // straight from a Menu item is flaky on iOS.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                        showReportDialog = true
                    }
                }
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
                StoryBrowserOverlay(url: url, offset: browserOffset, bottomInset: bottomSafeAreaInset, onClose: closeBrowser)
            }
        }
        .ignoresSafeArea()
        .onAppear {
            vm.onExit = { isPresented = false }
            vm.onAppear()
        }
        .onDisappear { vm.onDisappear() }
        .onChange(of: showBrowser) { _, open in
            // Hold the story timer while the browser is open; resume on close.
            open ? vm.pause() : vm.resume()
        }
        .sheet(item: $shareItem) { item in
            ActivityViewController(items: [item.text])
                .onDisappear { vm.resume() }
        }
        .alert("Zgłosić treść?", isPresented: $showReportDialog) {
            Button("Zgłaszam", role: .destructive) { vm.reportPost(reason: "inne") }
            Button("Anuluj", role: .cancel) { vm.resume() }
        } message: {
            Text("Treść trafi do weryfikacji moderatora.")
        }
    }

    // MARK: - Insets

    /// Home-indicator inset — the media ignores the safe area but the bottom card
    /// must sit above the iOS bottom bar.
    private var bottomSafeAreaInset: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }?.safeAreaInsets.bottom ?? 0
    }

    /// Status-bar / Dynamic Island inset — the top bar must sit below it.
    private var topSafeAreaInset: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }?.safeAreaInsets.top ?? 0
    }

    // MARK: - In-app browser (custom full-bleed bottom panel)

    private func openBrowser(_ url: URL) {
        browserURL = url
        showBrowser = true
        browserOffset = StoryBrowserOverlay.panelHeight
        DispatchQueue.main.async {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) {
                browserOffset = 0
            }
        }
    }

    private func closeBrowser() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) {
            browserOffset = StoryBrowserOverlay.panelHeight
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.28) {
            showBrowser = false
            browserOffset = 0
        }
    }

    /// Like / Dislike / Share capsule — kept in the hierarchy but hidden until the
    /// UI is reworked (rendered as an overlay so the info card stays full-width).
    private var actionCapsule: some View {
        VStack(spacing: 20) {
            let liked = vm.likedStates[vm.currentPost.id] ?? vm.currentPost.liked
            FaveLikeButton(isLiked: liked) { _ in
                vm.toggleLike(vm.currentPost.id)
            }
            let disliked = vm.dislikedStates[vm.currentPost.id] ?? vm.currentPost.disliked
            let dislikeCount = vm.dislikesCounts[vm.currentPost.id] ?? vm.currentPost.dislikes_count
            Button {
                Haptics.impact(.light)
                vm.toggleDislike(vm.currentPost.id)
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
                vm.pause()
                Task { await actions.sharePost(vm.currentPost.id) }
                shareItem = ShareItem(
                    id: vm.currentPost.id,
                    text: "\(DeepLink.scheme)://\(DeepLink.host)/\(vm.currentPost.id)"
                )
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: "arrowshape.turn.up.right.fill")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundColor(.white)
                    if vm.currentPost.shares_count > 0 {
                        Text("\(vm.currentPost.shares_count)")
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
}