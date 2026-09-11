import SwiftUI
import MapKit

struct ClusterBadge: View {
    let cluster: PostCluster
    let currentUserId: String?
    let onTap: () -> Void

    var body: some View {
        if cluster.count == 1, let post = cluster.singlePost {
            if post.watched && !post.isEvent {
                SinglePostPin(post: post, currentUserId: currentUserId)
                    .allowsHitTesting(false)
            } else {
                SinglePostPin(post: post, currentUserId: currentUserId)
                    .contentShape(Rectangle())
                    .onTapGesture(perform: onTap)
            }
        } else {
            ClusterPin(cluster: cluster)
                .contentShape(Rectangle())
                .onTapGesture(perform: onTap)
        }
    }
}

struct SinglePostPin: View {
    let post: Post
    let currentUserId: String?

    @State private var bounceOffset: CGFloat = 0

    private static let ttlHours: TimeInterval = AppConstants.postTTLHours

    private var isMine: Bool { currentUserId != nil && post.user_id == currentUserId }
    private var isHighlighted: Bool { !isMine && !post.watched }

    private var ageHours: Double {
        Double(Date().timeIntervalSince1970 - TimeInterval(post.created_at) / 1000) / AppConstants.secondsPerHour
    }

    private var ringColor: Color {
        guard isHighlighted else { return .white.opacity(0.5) }
        if ageHours > 20 { return .red }
        if ageHours > 12 { return .yellow }
        return .white
    }

    private func progress(at date: Date) -> Double {
        let elapsed = date.timeIntervalSince1970 - TimeInterval(post.created_at) / 1000
        return min(max(elapsed / (Self.ttlHours * AppConstants.secondsPerHour), 0), 1)
    }

    private var bounceAmount: CGFloat {
        guard isHighlighted else { return 0 }
        if ageHours > 20 { return 4 }
        if ageHours > 12 { return 2 }
        return 0
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            ZStack {
                TimelineView(.periodic(from: .now, by: 30)) { context in
                    let progress = progress(at: context.date)
                    ZStack {
                        Circle().fill(Color.black.opacity(0.25))
                        Circle().stroke(ringColor.opacity(0.25), lineWidth: 3)
                        Circle()
                            .trim(from: progress, to: 1)
                            .stroke(ringColor, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                    }
                }
                .frame(width: 52, height: 52)
                .onAppear { startBounce() }
                .onChange(of: post.id) { _, _ in
                    bounceOffset = 0
                    startBounce()
                }

                if let url = post.resolvedThumbURL {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().aspectRatio(contentMode: .fill)
                        case .empty:
                            ZStack {
                                Color.white.opacity(0.2)
                                ProgressView().tint(.white)
                            }
                        case .failure:
                            fallbackIcon
                        @unknown default:
                            fallbackIcon
                        }
                    }
                    .frame(width: 44, height: 44)
                    .clipShape(Circle())
                } else {
                    fallbackIcon
                        .frame(width: 44, height: 44)
                        .clipShape(Circle())
                }
            }
            .opacity(post.watched ? 0.4 : 1)
            .saturation(post.watched ? 0.3 : 1)
            .offset(y: bounceOffset)
        }
    }

    private var fallbackIcon: some View {
        ZStack {
            Circle().fill(Color.white.opacity(0.9))
            Image(systemName: post.travelPinSymbol ?? iconForType(post.type))
                .font(.body)
                .foregroundColor(.black.opacity(0.7))
        }
    }

    private func startBounce() {
        guard bounceAmount > 0 else { return }
        bounceOffset = 0
        withAnimation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true)) {
            bounceOffset = -bounceAmount
        }
    }
}

private func iconForType(_ type: Post.MediaType) -> String {
    type == .video ? "video.fill" : "photo.fill"
}

/// Non-clickable "?" drop pin asking others in the area for a live view.
struct RequestPinBadge: View {
    let request: MediaRequest

    private static let ttlHours: TimeInterval = AppConstants.mediaRequestTTLHours

    private var ringColor: Color {
        if request.ageHours > 3 { return .red }
        if request.ageHours > 1 { return .yellow }
        return .white
    }

    private func progress(at date: Date) -> Double {
        let elapsed = date.timeIntervalSince1970 - TimeInterval(request.created_at) / 1000
        return min(max(elapsed / (Self.ttlHours * AppConstants.secondsPerHour), 0), 1)
    }

    var body: some View {
        ZStack {
            TimelineView(.periodic(from: .now, by: 30)) { context in
                let progress = progress(at: context.date)
                ZStack {
                    Circle().fill(Color.black.opacity(0.25))
                    Circle().stroke(ringColor.opacity(0.25), lineWidth: 3)
                    Circle()
                        .trim(from: progress, to: 1)
                        .stroke(ringColor, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
            }
            .frame(width: 52, height: 52)

            ZStack {
                Circle().fill(Color.white.opacity(0.95))
                Image("MediaRequestPin")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 34, height: 34)
            }
            .frame(width: 44, height: 44)
            .clipShape(Circle())
        }
    }
}

struct ClusterPin: View {
    let cluster: PostCluster

    private static let ttlHours: TimeInterval = AppConstants.postTTLHours

    private var oldest: Post {
        cluster.posts.min(by: { $0.created_at < $1.created_at }) ?? cluster.posts[0]
    }

    private var ageHours: Double {
        Double(Date().timeIntervalSince1970 - TimeInterval(oldest.created_at) / 1000) / AppConstants.secondsPerHour
    }

    private var ringColor: Color {
        if ageHours > 20 { return .red }
        if ageHours > 12 { return .yellow }
        return .white
    }

    private func progress(at date: Date) -> Double {
        let elapsed = date.timeIntervalSince1970 - TimeInterval(oldest.created_at) / 1000
        return min(max(elapsed / (Self.ttlHours * AppConstants.secondsPerHour), 0), 1)
    }

    var body: some View {
        ZStack {
            TimelineView(.periodic(from: .now, by: 30)) { context in
                let progress = progress(at: context.date)
                ZStack {
                    Circle().fill(Color.black.opacity(0.25))
                    Circle().stroke(ringColor.opacity(0.25), lineWidth: 3)
                    Circle()
                        .trim(from: progress, to: 1)
                        .stroke(ringColor, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
            }
            .frame(width: 52, height: 52)

            Circle()
                .fill(Color.accentColor)
                .frame(width: 44, height: 44)

            Text("\(cluster.count)")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(.white)
        }
    }
}
