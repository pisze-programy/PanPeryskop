import SwiftUI
import MapKit

struct MapKitMapView: View {
    let center: CLLocationCoordinate2D
    let zoom: Double
    let posts: [Post]
    let pendingIds: Set<String>
    let currentUserId: String?
    @Binding var showReturnPill: Bool
    let centerThreshold: Double
    let onRegionChange: (Double, Double, Double, Double) -> Void
    let onTapPost: (Post) -> Void
    let onTapCluster: (PostCluster) -> Void

    @State private var camera: MapCameraPosition
    @State private var isChangingCity = false

    init(
        center: CLLocationCoordinate2D,
        zoom: Double,
        posts: [Post],
        pendingIds: Set<String>,
        currentUserId: String?,
        showReturnPill: Binding<Bool>,
        centerThreshold: Double,
        onRegionChange: @escaping (Double, Double, Double, Double) -> Void,
        onTapPost: @escaping (Post) -> Void,
        onTapCluster: @escaping (PostCluster) -> Void
    ) {
        self.center = center
        self.zoom = zoom
        self.posts = posts
        self.pendingIds = pendingIds
        self.currentUserId = currentUserId
        self._showReturnPill = showReturnPill
        self.centerThreshold = centerThreshold
        self.onRegionChange = onRegionChange
        self.onTapPost = onTapPost
        self.onTapCluster = onTapCluster
        let region = MKCoordinateRegion(center: center, span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05))
        self._camera = State(initialValue: .region(region))
    }

    var body: some View {
        MapReader { _ in
            Map(position: $camera, bounds: MapCameraBounds(minimumDistance: 500, maximumDistance: 20000)) {
                UserAnnotation()

                ForEach(makeClusters(posts, pendingIds: pendingIds)) { cluster in
                    Annotation(coordinate: cluster.coord, anchor: .center) {
                        ClusterBadge(
                            cluster: cluster,
                            currentUserId: currentUserId,
                            onTap: {
                                if cluster.count == 1, let post = cluster.singlePost {
                                    onTapPost(post)
                                } else {
                                    onTapCluster(cluster)
                                }
                            }
                        )
                    } label: { EmptyView() }
                }
            }
            .mapStyle(.standard(pointsOfInterest: .excludingAll))
            .onMapCameraChange(frequency: .onEnd) { ctx in
                let region = ctx.region
                let swLat = region.center.latitude - region.span.latitudeDelta / 2
                let swLng = region.center.longitude - region.span.longitudeDelta / 2
                let neLat = region.center.latitude + region.span.latitudeDelta / 2
                let neLng = region.center.longitude + region.span.longitudeDelta / 2
                onRegionChange(swLat, swLng, neLat, neLng)
                handleCameraSettled(at: region.center)
            }
            .onReceive(NotificationCenter.default.publisher(for: .flyToCity)) { note in
                guard let city = note.object as? City else { return }
                flyTo(city: city)
            }
            .onReceive(NotificationCenter.default.publisher(for: .returnToCenter)) { _ in
                withAnimation(.easeInOut(duration: 0.5)) {
                    camera = .region(MKCoordinateRegion(center: center, span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)))
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: .scrollToPost)) { note in
                guard let post = note.object as? Post else { return }
                withAnimation(.easeInOut(duration: 0.6)) {
                    camera = .region(MKCoordinateRegion(
                        center: post.coordinate,
                        span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
                    ))
                }
            }
        }
    }

    private func flyTo(city: City) {
        isChangingCity = true
        withAnimation(.easeInOut(duration: 1.2)) {
            showReturnPill = false
            camera = .region(city.region)
        }
    }

    private func handleCameraSettled(at coord: CLLocationCoordinate2D) {
        isChangingCity = false
        checkDistance(from: coord)
    }

    private func checkDistance(from coord: CLLocationCoordinate2D) {
        let d = dist(coord.latitude, coord.longitude, center.latitude, center.longitude)
        withAnimation(.easeInOut(duration: 0.3)) {
            showReturnPill = d > centerThreshold
        }
    }
}

struct ClusterBadge: View {
    let cluster: PostCluster
    let currentUserId: String?
    let onTap: () -> Void

    var body: some View {
        if cluster.count == 1, let post = cluster.singlePost {
            if post.watched {
                SinglePostPin(post: post, isPending: cluster.isPending, currentUserId: currentUserId)
            } else {
                Button(action: onTap) {
                    SinglePostPin(post: post, isPending: cluster.isPending, currentUserId: currentUserId)
                }
                .buttonStyle(.plain)
            }
        } else {
            Button(action: onTap) {
                ClusterPin(cluster: cluster)
            }
            .buttonStyle(.plain)
        }
    }
}

struct SinglePostPin: View {
    let post: Post
    let isPending: Bool
    let currentUserId: String?

    @State private var bounceOffset: CGFloat = 0

    private static let ttlHours: TimeInterval = 24

    private var isMine: Bool { currentUserId != nil && post.user_id == currentUserId }
    private var isHighlighted: Bool { !isMine && !post.watched }

    private var ageHours: Double {
        Double(Date().timeIntervalSince1970 - TimeInterval(post.created_at) / 1000) / 3600
    }

    private var ringColor: Color {
        guard isHighlighted else { return .white.opacity(0.5) }
        if ageHours > 20 { return .red }
        if ageHours > 12 { return .yellow }
        return .white
    }

    private func progress(at date: Date) -> Double {
        let elapsed = date.timeIntervalSince1970 - TimeInterval(post.created_at) / 1000
        return min(max(elapsed / (Self.ttlHours * 3600), 0), 1)
    }

    private var bounceAmount: CGFloat {
        guard isHighlighted else { return 0 }
        if ageHours > 20 { return 4 }
        if ageHours > 12 { return 2 }
        return 0
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            ZStack {
                TimelineView(.periodic(from: .now, by: 30)) { context in
                    let progress = progress(at: context.date)
                    ZStack {
                        Circle()
                            .fill(Color.black.opacity(0.25))
                        Circle()
                            .stroke(ringColor.opacity(0.25), lineWidth: 3)
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

            if post.watched {
                Image(systemName: "eye.slash.fill")
                    .font(.system(size: 9))
                    .foregroundColor(.red)
                    .padding(3)
                    .background(.ultraThinMaterial)
                    .clipShape(Circle())
                    .offset(x: 6, y: -6)
            } else if isPending {
                Image(systemName: "lock.fill")
                    .font(.system(size: 9))
                    .foregroundColor(.orange)
                    .padding(3)
                    .background(.ultraThinMaterial)
                    .clipShape(Circle())
                    .offset(x: 6, y: -6)
            }
        }
    }

    private var fallbackIcon: some View {
        ZStack {
            Circle().fill(Color.white.opacity(0.9))
            Image(systemName: iconForType(post.type))
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
    if type == .video { return "video.fill" }
    if type == .text { return "doc.text.fill" }
    return "photo.fill"
}

private func dist(_ lat1: Double, _ lng1: Double, _ lat2: Double, _ lng2: Double) -> Double {
    let dlat = lat1 - lat2
    let dlng = lng1 - lng2
    return sqrt(dlat * dlat + dlng * dlng)
}

struct ClusterPin: View {
    let cluster: PostCluster

    private static let ttlHours: TimeInterval = 24

    private var oldest: Post {
        cluster.posts.min(by: { $0.created_at < $1.created_at }) ?? cluster.posts[0]
    }

    private var ageHours: Double {
        Double(Date().timeIntervalSince1970 - TimeInterval(oldest.created_at) / 1000) / 3600
    }

    private var ringColor: Color {
        if ageHours > 20 { return .red }
        if ageHours > 12 { return .yellow }
        return .white
    }

    private func progress(at date: Date) -> Double {
        let elapsed = date.timeIntervalSince1970 - TimeInterval(oldest.created_at) / 1000
        return min(max(elapsed / (Self.ttlHours * 3600), 0), 1)
    }

    var body: some View {
        ZStack {
            TimelineView(.periodic(from: .now, by: 30)) { context in
                let progress = progress(at: context.date)
                ZStack {
                    Circle()
                        .fill(Color.black.opacity(0.25))
                    Circle()
                        .stroke(ringColor.opacity(0.25), lineWidth: 3)
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

struct PostCluster: Identifiable {
    let id: String
    let coord: CLLocationCoordinate2D
    let count: Int
    let singlePost: Post?
    let posts: [Post]
    let isPending: Bool
}

private func makeClusters(_ posts: [Post], pendingIds: Set<String>) -> [PostCluster] {
    let mediaPosts = posts.filter { $0.type != .text }
    let radius = 0.0008
    var used = Set<String>()
    var clusters: [PostCluster] = []

    for post in mediaPosts {
        guard !used.contains(post.id) else { continue }
        var nearby = [post]
        if !post.watched {
            for other in mediaPosts {
                guard !used.contains(other.id), other.id != post.id, !other.watched else { continue }
                if dist(post.lat, post.lng, other.lat, other.lng) < radius {
                    nearby.append(other)
                }
            }
        }
        nearby.forEach { used.insert($0.id) }
        let avgLat = nearby.map(\.lat).reduce(0, +) / Double(nearby.count)
        let avgLng = nearby.map(\.lng).reduce(0, +) / Double(nearby.count)
        let anyPending = nearby.contains(where: { pendingIds.contains($0.id) })
        clusters.append(PostCluster(
            id: post.id,
            coord: CLLocationCoordinate2D(latitude: avgLat, longitude: avgLng),
            count: nearby.count,
            singlePost: nearby.count == 1 ? nearby.first : nil,
            posts: nearby,
            isPending: anyPending
        ))
    }
    return clusters
}
