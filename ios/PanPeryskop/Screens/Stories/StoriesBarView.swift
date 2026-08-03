import SwiftUI
import Kingfisher

struct StoriesBarView: View {
    let posts: [Post]
    let onTapStory: (Int) -> Void

    var body: some View {
        if posts.isEmpty {
            EmptyView()
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
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
            .frame(height: 100)
        }
    }
}

struct StoryThumbnail: View {
    let post: Post

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.secondary.opacity(0.3))
                .frame(width: 160, height: 90)
                .overlay {
                    if let thumb = post.thumb_url ?? post.media_url, let url = URL(string: thumb) {
                        KFImage(url)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 160, height: 90)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    } else {
                        Image(systemName: post.type == .text ? "doc.text.fill" : "photo.fill")
                            .font(.title2)
                            .foregroundColor(.secondary)
                    }
                }

            VStack(alignment: .leading, spacing: 2) {
                Text(post.description)
                    .font(.caption2)
                    .fontWeight(.medium)
                    .lineLimit(1)
                    .foregroundColor(.white)
                Text(post.author_name.prefix(12) + "...")
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.8))
            }
            .padding(6)
            .background(LinearGradient(colors: [.black.opacity(0.6), .clear], startPoint: .bottom, endPoint: .top))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .frame(width: 160, height: 90)
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
            media_url: nil, thumb_url: nil
        )
        StoriesBarView(posts: [post], onTapStory: { _ in })
    }
}
