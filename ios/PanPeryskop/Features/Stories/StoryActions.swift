import SwiftUI

/// What the story viewer needs from a content provider — narrow, so Trips content can
/// reuse the viewer later without coupling to MapViewModel.
@MainActor
protocol StoryActions {
    var tags: [TagPill] { get }
    func toggleLike(_ postId: String) async -> Bool
    func toggleDislike(_ postId: String) async -> Bool
    func sharePost(_ postId: String) async
    func markWatched(_ postId: String) async
}
