import SwiftUI

struct LocalEventsListView: View {
    @ObservedObject var mapViewModel: MapViewModel
    @ObservedObject var listViewModel: LocalEventsListViewModel
    let onCityTap: () -> Void
    let onDayTap: () -> Void
    let onSelectPost: (Post, String?) -> Void

    private static let bottomContentInset: CGFloat = 170

    private var visibleTags: [TagPill] {
        mapViewModel.sortedTags.filter { $0.id != LocalEventsListViewModel.restaurantTagId }
    }

    private var effectiveTagsParam: String? {
        LocalEventsListViewModel.effectiveTagsParam(
            mapViewModel.selectedTagsParam,
            visibleTags: visibleTags
        )
    }

    private var queryKey: String {
        "\(mapViewModel.selectedCity.id)|\(effectiveTagsParam ?? "all")|\(mapViewModel.selectedDayOffset)"
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
                tags: effectiveTagsParam,
                startDayOffset: mapViewModel.selectedDayOffset
            )
        }
        .onChange(of: queryKey) { _, _ in
            listViewModel.loadInitial(
                city: mapViewModel.selectedCity,
                tags: effectiveTagsParam,
                startDayOffset: mapViewModel.selectedDayOffset
            )
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
                tags: effectiveTagsParam,
                startDayOffset: mapViewModel.selectedDayOffset
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
                    Chip(label: tag.label, isSelected: mapViewModel.isTagSelected(tag.id)) {
                        toggleVisibleTag(tag.id)
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.m)
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemGroupedBackground))
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
                    tags: effectiveTagsParam,
                    startDayOffset: mapViewModel.selectedDayOffset
                )
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.xl)
        } else if listViewModel.sections.isEmpty {
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
            sectionHeader(section)
        }
    }

    private func interSectionBottomPadding(postId: String, lastPostId: String?, sectionId: String) -> CGFloat {
        guard postId == lastPostId, sectionId != lastSectionId else { return 0 }
        return Theme.Spacing.l
    }

    private func sectionHeader(_ section: LocalDaySection) -> some View {
        StickyDayHeaderView(title: section.title)
            .onAppear {
                listViewModel.loadMoreIfNeeded(
                    currentSection: section,
                    city: mapViewModel.selectedCity,
                    tags: effectiveTagsParam,
                    startDayOffset: mapViewModel.selectedDayOffset
                )
            }
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
                        tags: effectiveTagsParam,
                        startDayOffset: mapViewModel.selectedDayOffset
                    )
                }
        }
    }

    private func toggleVisibleTag(_ id: String) {
        let selectedVisible = visibleTags.filter { mapViewModel.isTagSelected($0.id) }.count
        if mapViewModel.isTagSelected(id), selectedVisible <= 1 { return }
        mapViewModel.toggleTag(id)
    }
}
