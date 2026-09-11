import SwiftUI

struct MyContentView: View {
    @State private var posts: [MyPost] = []
    @State private var isLoading = true
    @State private var loadError: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Ładowanie…")
            } else if let loadError {
                ContentUnavailableView {
                    Label("Błąd", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Spróbuj ponownie") { Task { await load() } }
                }
            } else if posts.isEmpty {
                ContentUnavailableView {
                    Label("Brak treści", systemImage: "photo.stack")
                } description: {
                    Text("Opublikuj coś, aby zobaczyć je tutaj.")
                }
            } else {
                List(posts) { post in
                    MyContentRow(post: post)
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Moje treści")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        loadError = nil
        defer { isLoading = false }
        do {
            let resp: [MyPost] = try await APIClient.get("/users/me/posts")
            posts = resp
        } catch {
            loadError = "Nie udało się pobrać treści. Spróbuj ponownie."
        }
    }
}

struct MyContentRow: View {
    let post: MyPost

    var body: some View {
        HStack(spacing: 12) {
            thumbnail

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    statusBadge
                    Text(post.isPhoto ? "Zdjęcie" : "Wideo")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                if post.displayStatus == .rejected,
                   let reason = post.rejection_reason, !reason.isEmpty {
                    Text("Powód: \(reason)")
                        .font(.caption)
                        .foregroundColor(.red)
                        .lineLimit(2)
                }

                HStack(spacing: 12) {
                    Label("\(post.views_count)", systemImage: "eye.fill")
                    Label("\(post.likes_count)", systemImage: "heart.fill")
                    Label("\(post.shares_count)", systemImage: "arrowshape.turn.up.right.fill")
                }
                .font(.caption)
                .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var thumbnail: some View {
        Group {
            if let thumb = post.thumb_url, let url = URL(string: thumb) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().aspectRatio(contentMode: .fill)
                    default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: 64, height: 64)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var placeholder: some View {
        ZStack {
            Color(.systemGray5)
            Image(systemName: post.isPhoto ? "photo.fill" : "video.fill")
                .foregroundColor(.secondary)
        }
    }

    private var statusBadge: some View {
        let color: Color
        switch post.displayStatus {
        case .published: color = .green
        case .rejected: color = .red
        case .disabled: color = .gray
        }
        return Text(post.displayStatus.label)
            .font(.caption2.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.15))
            .foregroundColor(color)
            .clipShape(Capsule())
    }
}
