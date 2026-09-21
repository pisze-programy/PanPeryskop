import SwiftUI
import MapKit

struct ClusterBadge: View {
    let cluster: PostCluster
    let currentUserId: String?
    let onTap: () -> Void

    var body: some View {
        if cluster.count == 1, let post = cluster.singlePost {
            SinglePostPin(post: post, currentUserId: currentUserId)
                .contentShape(Rectangle())
                .onTapGesture(perform: onTap)
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
    private var isHighlighted: Bool { !isMine }

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
        guard !post.isRestaurant, isHighlighted else { return 0 }
        if ageHours > 20 { return 4 }
        if ageHours > 12 { return 2 }
        return 0
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            ZStack {
                ring
                    .frame(width: 52, height: 52)
                    .onAppear { startBounce() }
                    .onChange(of: post.id) { _, _ in
                        bounceOffset = 0
                        startBounce()
                    }

                if let url = post.resolvedThumbURL, !post.isRestaurant {
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
            .overlay(alignment: .bottomTrailing) {
                if post.restaurantStars > 0 { starBadge }
            }
            .offset(y: bounceOffset)
        }
    }

    /// Restaurants are evergreen: no TTL ring, only the plain backing.
    @ViewBuilder
    private var ring: some View {
        if post.isRestaurant {
            Circle().fill(Color.black.opacity(0.25))
        } else {
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
        }
    }

    private var starBadge: some View {
        HStack(spacing: 1) {
            ForEach(0..<post.restaurantStars, id: \.self) { _ in
                Image(systemName: "star.fill")
                    .font(.system(size: 8, weight: .bold))
                    // Same gray family as the card's distinction label. systemGray
                    // (not .secondary) stays readable on the dark badge capsule.
                    .foregroundColor(Color(.systemGray))
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 3)
        .background(Capsule().fill(Color.black.opacity(0.8)))
        .overlay(Capsule().stroke(.white, lineWidth: 1))
    }

    private var fallbackIcon: some View {
        ZStack {
            if post.isRestaurant {
                LinearGradient(
                    colors: [Color(hex: 0xE4572E), Color(hex: 0x8C1D18)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Image(systemName: "fork.knife")
                    .font(.body)
                    .foregroundColor(.white)
            } else if let style = post.travelPin {
                LinearGradient(
                    colors: [Color(hex: style.startHex), Color(hex: style.endHex)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Image(systemName: style.icon)
                    .font(.body)
                    .foregroundColor(.white)
            } else {
                Circle().fill(Color.white.opacity(0.9))
                Image(systemName: iconForType(post.type))
                    .font(.body)
                    .foregroundColor(.black.opacity(0.7))
            }
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
    // Same glyph as the story preview placeholder for a missing image.
    type == .video ? "video.slash" : "photo.badge.exclamationmark"
}


struct ClusterPin: View {
    let cluster: PostCluster

    private static let ttlHours: Double = AppConstants.postTTLHours

    @State private var sheenPhase: CGFloat = -1.4

    /// Restaurants are evergreen, so they carry no TTL. Only the timed members
    /// drive the ring; a cluster of restaurants alone has none.
    private var timedPosts: [Post] { cluster.posts.filter { !$0.isRestaurant } }

    private var oldest: Post? { timedPosts.min(by: { $0.created_at < $1.created_at }) }

    private var ageHours: Double {
        guard let oldest else { return 0 }
        return Double(Date().timeIntervalSince1970 - TimeInterval(oldest.created_at) / 1000) / AppConstants.secondsPerHour
    }

    private var ringColor: Color {
        if ageHours > 20 { return .red }
        if ageHours > 12 { return .yellow }
        return .white
    }

    private func progress(at date: Date) -> Double {
        guard let oldest else { return 0 }
        let elapsed = date.timeIntervalSince1970 - TimeInterval(oldest.created_at) / 1000
        return min(max(elapsed / (Self.ttlHours * AppConstants.secondsPerHour), 0), 1)
    }

    @ViewBuilder
    private var ring: some View {
        if oldest == nil {
            Circle().fill(Color.black.opacity(0.25))
        } else {
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
        }
    }

    var body: some View {
        ZStack {
            ring
                .frame(width: 52, height: 52)

            Circle()
                .fill(Color.accentColor)
                .frame(width: 44, height: 44)

            Text("\(cluster.count)")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(.white)
        }
        .overlay { sheen }
    }

    /// A slow, faint blue sweep, so a group pin is not fully static.
    private var sheen: some View {
        GeometryReader { geo in
            LinearGradient(
                colors: [.clear, Color(hex: 0x9ecbff).opacity(0.45), .clear],
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(width: geo.size.width * 0.7)
            .offset(x: sheenPhase * geo.size.width)
        }
        .clipShape(Circle())
        .allowsHitTesting(false)
        .onAppear {
            withAnimation(.linear(duration: 2.6).repeatForever(autoreverses: false)) {
                sheenPhase = 1.4
            }
        }
    }
}
