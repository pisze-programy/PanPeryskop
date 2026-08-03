import Foundation

@MainActor
class PendingStore: ObservableObject {
    static let shared = PendingStore()
    @Published var posts: [Post] = []
    private let storageKey = "pending_posts"

    init() { load() }

    func save(_ post: Post) {
        posts.append(post)
        persist()
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(posts) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return }
        posts = (try? JSONDecoder().decode([Post].self, from: data)) ?? []
    }
}
