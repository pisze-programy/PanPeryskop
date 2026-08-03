import SwiftUI

struct StoriesBarView: View {
    let posts: [Post]
    let onTapStory: (Int) -> Void

    var body: some View {
        if posts.isEmpty {
            EmptyView()
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 10) {
                    ForEach(Array(posts.enumerated()), id: \.element.id) { index, post in
                        Button {
                            onTapStory(index)
                        } label: {
                            StoryThumbnail(post: post)
                        }
                    }
                }
                .padding(.horizontal, 12)
            }
            .frame(height: 180)
        }
    }
}

struct StoryThumbnail: View {
    let post: Post

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.secondary.opacity(0.3))
                .frame(width: 88, height: 156)
                .overlay {
                    if let url = post.resolvedThumbURL {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let image):
                                image.resizable().aspectRatio(contentMode: .fill)
                            case .empty:
                                ZStack {
                                    Color.secondary.opacity(0.2)
                                    ProgressView()
                                }
                            case .failure:
                                Color.secondary.opacity(0.2)
                            @unknown default:
                                Color.secondary.opacity(0.2)
                            }
                        }
                        .frame(width: 88, height: 156)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    } else {
                        Image(systemName: post.type == .text ? "doc.text.fill" : "photo.fill")
                            .font(.title2)
                            .foregroundColor(.secondary)
                    }
                }

            if isPending(post) {
                VStack {
                    HStack {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 9))
                            .foregroundColor(.orange)
                            .padding(4)
                            .background(.ultraThinMaterial)
                            .clipShape(Circle())
                        Spacer()
                    }
                    Spacer()
                }
                .padding(6)
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 5) {
                    StoryAvatar(url: post.author_avatar_url, size: 18)
                    Text(post.author_name.prefix(10) + (post.author_name.count > 10 ? "…" : ""))
                        .font(.system(size: 9))
                        .fontWeight(.medium)
                        .foregroundColor(.white)
                        .lineLimit(1)
                }
                Text(post.description)
                    .font(.system(size: 9))
                    .lineLimit(2)
                    .foregroundColor(.white)
                Text(StoryDateFormatter.format(post.created_at))
                    .font(.system(size: 8))
                    .foregroundColor(.white.opacity(0.8))
            }
            .padding(6)
            .background(LinearGradient(colors: [.black.opacity(0.7), .clear], startPoint: .bottom, endPoint: .top))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .frame(width: 88, height: 156)
    }

    private func isPending(_ post: Post) -> Bool {
        PendingStore.shared.posts.map(\.id).contains(post.id)
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
                        Image(systemName: "person.crop.circle.fill")
                            .resizable()
                            .foregroundColor(.white.opacity(0.8))
                    }
                }
            } else {
                Image(systemName: "person.crop.circle.fill")
                    .resizable()
                    .foregroundColor(.white.opacity(0.8))
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
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

struct StoriesBarView_Previews: PreviewProvider {
    static var previews: some View {
        let post = Post(
            id: "1", user_id: "u1", type: .photo,
            lat: 52.4, lng: 16.9, description: "Test",
            media_key: nil, thumb_key: nil,
            created_at: 0, expires_at: 0,
            likes_count: 5, views_count: 10, shares_count: 1,
            grid_cell_id: nil,
            liked: false, watched: false,
            author_name: "user123",
            media_url: nil, thumb_url: nil,
            author_avatar_url: nil
        )
        StoriesBarView(posts: [post], onTapStory: { _ in })
    }
}
