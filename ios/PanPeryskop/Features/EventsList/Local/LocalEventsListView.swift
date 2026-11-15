import SwiftUI

struct LocalEventsListView: View {
    @ObservedObject var mapViewModel: MapViewModel
    @ObservedObject var listViewModel: LocalEventsListViewModel
    let onCityTap: () -> Void
    let onDayTap: () -> Void
    let onSelectPost: (Post, String?) -> Void

    private static let bottomContentInset: CGFloat = 170
    private static let filterTrailingExtraPadding: CGFloat = 6

    private var rawVisibleTags: [TagPill] {
        mapViewModel.tags.filter { $0.id != LocalEventsListViewModel.restaurantTagId }
    }

    private var visibleTags: [TagPill] {
        TagSorting.sorted(rawVisibleTags, counts: listViewModel.tagCounts)
    }

    private var effectiveFilterTagIds: Set<String>? {
        LocalEventsListViewModel.effectiveFilterTagIds(
            mapViewModel.selectedTagsParam,
            visibleTags: rawVisibleTags
        )
    }

    private var scopeKey: String {
        "\(mapViewModel.selectedCity.id)|\(mapViewModel.selectedDayOffset)"
    }

    private var tagSelectionKey: String {
        "\(mapViewModel.selectedTagsParam ?? "all")|\(rawVisibleTags.count)"
    }

    private var lastSectionId: String? {
        listViewModel.sections.last?.id
    }

    var body: some View {
        VStack(spacing: 0) {
            filterBar
            Divider()
            scrollContent
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .onAppear {
            listViewModel.loadIfNeeded(
                city: mapViewModel.selectedCity,
                tags: mapViewModel.selectedTagsParam,
                startDayOffset: mapViewModel.selectedDayOffset,
                visibleTags: rawVisibleTags
            )
        }
        .onChange(of: scopeKey) { _, _ in
            listViewModel.loadIfNeeded(
                city: mapViewModel.selectedCity,
                tags: mapViewModel.selectedTagsParam,
                startDayOffset: mapViewModel.selectedDayOffset,
                visibleTags: rawVisibleTags
            )
        }
        .onChange(of: tagSelectionKey) { _, _ in
            listViewModel.syncTags(effectiveFilterTagIds)
        }
    }

    private var scrollContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Theme.Spacing.s, pinnedViews: [.sectionHeaders]) {
                contentBody
            }
            .padding(.top, Theme.Spacing.xs)
            .padding(.bottom, Self.bottomContentInset)
        }
        .refreshable {
            await listViewModel.refresh(
                city: mapViewModel.selectedCity,
                tags: mapViewModel.selectedTagsParam,
                startDayOffset: mapViewModel.selectedDayOffset,
                visibleTags: rawVisibleTags
            )
        }
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.s) {
                MapPickerPill(
                    title: DayLabels.pill(offset: mapViewModel.selectedDayOffset),
                    action: onDayTap
                )
                MapPickerPill(title: mapViewModel.selectedCity.name, action: onCityTap)
                    .padding(.trailing, Theme.Spacing.xs)
                ForEach(visibleTags) { tag in
                    filterChip(for: tag)
                }
            }
            .padding(.leading, Theme.Spacing.l)
            .padding(.trailing, Theme.Spacing.l + Self.filterTrailingExtraPadding)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.m)
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemGroupedBackground))
    }

    private func filterChip(for tag: TagPill) -> some View {
        Chip(
            label: tag.label,
            isSelected: isVisibleTagSelected(tag.id),
            badgeCount: listViewModel.tagCounts[tag.id] ?? 0,
            showsBadgeWhenEmpty: true
        ) {
            toggleVisibleTag(tag.id)
        }
    }

    @ViewBuilder
    private var contentBody: some View {
        if listViewModel.isInitialLoading && listViewModel.sections.isEmpty {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.top, Theme.Spacing.xxl)
        } else if let error = listViewModel.errorMessage, listViewModel.sections.isEmpty {
            ErrorState(message: error) {
                listViewModel.loadInitial(
                    city: mapViewModel.selectedCity,
                    tags: mapViewModel.selectedTagsParam,
                    startDayOffset: mapViewModel.selectedDayOffset,
                    visibleTags: rawVisibleTags
                )
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.xl)
        } else if listViewModel.sections.isEmpty && !listViewModel.isLoadingMore {
            EmptyState(
                icon: "calendar",
                title: "Brak nadchodzących wydarzeń",
                message: "Spróbuj zmienić filtry lub wybierz inne miasto."
            )
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.xl)
        } else {
            sectionsList
        }
    }

    @ViewBuilder
    private var sectionsList: some View {
        ForEach(listViewModel.sections) { section in
            daySectionView(section)
        }
        loadMoreFooter
    }

    private func daySectionView(_ section: LocalDaySection) -> some View {
        let lastPostId = section.posts.last?.id
        return Section {
            ForEach(section.posts) { post in
                eventRow(for: post)
                    .padding(.bottom, interSectionBottomPadding(postId: post.id, lastPostId: lastPostId, sectionId: section.id))
            }
        } header: {
            StickyDayHeaderView(title: section.title)
        }
    }

    private func interSectionBottomPadding(postId: String, lastPostId: String?, sectionId: String) -> CGFloat {
        guard postId == lastPostId, sectionId != lastSectionId else { return 0 }
        return Theme.Spacing.l
    }

    private func eventRow(for post: Post) -> some View {
        EventRowCard(post: post, tags: mapViewModel.tags, onSelect: onSelectPost)
            .padding(.horizontal, Theme.Spacing.l)
    }

    @ViewBuilder
    private var loadMoreFooter: some View {
        if listViewModel.isLoadingMore {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Spacing.l)
        } else if listViewModel.hasMore {
            Color.clear
                .frame(height: 1)
                .onAppear {
                    listViewModel.loadMore(
                        city: mapViewModel.selectedCity,
                        tags: mapViewModel.selectedTagsParam,
                        startDayOffset: mapViewModel.selectedDayOffset
                    )
                }
        }
    }

    private func isVisibleTagSelected(_ id: String) -> Bool {
        guard let filterIds = effectiveFilterTagIds else { return true }
        return filterIds.contains(id)
    }

    private func toggleVisibleTag(_ id: String) {
        let explicitSelected = rawVisibleTags.map(\.id).filter { mapViewModel.isTagSelected($0) }
        if explicitSelected.isEmpty {
            selectComplementVisibleTags(excluding: id)
            return
        }
        if explicitSelected.contains(id), explicitSelected.count <= 1 { return }
        mapViewModel.toggleTag(id)
    }

    private func selectComplementVisibleTags(excluding excludedId: String) {
        let remaining = rawVisibleTags.map(\.id).filter { $0 != excludedId }
        for tagId in remaining {
            mapViewModel.toggleTag(tagId)
        }
    }
}
