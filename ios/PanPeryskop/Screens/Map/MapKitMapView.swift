import SwiftUI
import MapKit

struct MapKitMapView: View {
    let center: CLLocationCoordinate2D
    let zoom: Double
    let heatmapCells: [GridCell]
    let posts: [Post]
    let pendingIds: Set<String>
    let currentUserId: String?
    @Binding var showReturnPill: Bool
    let centerThreshold: Double
    let onRegionChange: (Double, Double, Double, Double) -> Void
    let onTapHeatCell: (GridCell) -> Void
    let onTapPost: (Post) -> Void

    @State private var camera: MapCameraPosition

    init(
        center: CLLocationCoordinate2D,
        zoom: Double,
        heatmapCells: [GridCell],
        posts: [Post],
        pendingIds: Set<String>,
        currentUserId: String?,
        showReturnPill: Binding<Bool>,
        centerThreshold: Double,
        onRegionChange: @escaping (Double, Double, Double, Double) -> Void,
        onTapHeatCell: @escaping (GridCell) -> Void,
        onTapPost: @escaping (Post) -> Void
    ) {
        self.center = center
        self.zoom = zoom
        self.heatmapCells = heatmapCells
        self.posts = posts
        self.pendingIds = pendingIds
        self.currentUserId = currentUserId
        self._showReturnPill = showReturnPill
        self.centerThreshold = centerThreshold
        self.onRegionChange = onRegionChange
        self.onTapHeatCell = onTapHeatCell
        self.onTapPost = onTapPost
        let region = MKCoordinateRegion(center: center, span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05))
        self._camera = State(initialValue: .region(region))
    }

    var body: some View {
        MapReader { proxy in
            Map(position: $camera, bounds: MapCameraBounds(minimumDistance: 500, maximumDistance: 20000)) {
                ForEach(heatmapCells) { cell in
                    let color = heatColor(cell.heat)
                    let alpha = min(1.0, Double(cell.heat) / 10.0)
                    let coords = makeCoords(lat: cell.lat, lng: cell.lng, size: 0.0008)
                    MapPolygon(coordinates: coords)
                        .foregroundStyle(color.opacity(alpha * 0.4))
                        .stroke(color.opacity(0.8), lineWidth: 0.5)
                }

                ForEach(makeClusters(posts, pendingIds: pendingIds)) { cluster in
                    Annotation(cluster.label, coordinate: cluster.coord) {
                        ClusterBadge(
                            cluster: cluster,
                            currentUserId: currentUserId,
                            onTap: { onTapPost(cluster.singlePost!) }
                        )
                    }
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
                checkDistance(from: region.center)
            }
            .onTapGesture { pos in
                guard let coord = proxy.convert(pos, from: .local) else { return }
                let nearest = nearestCell(to: coord)
                if let cell = nearest { onTapHeatCell(cell) }
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

    private func checkDistance(from coord: CLLocationCoordinate2D) {
        let d = dist(coord.latitude, coord.longitude, center.latitude, center.longitude)
        withAnimation(.easeInOut(duration: 0.3)) {
            showReturnPill = d > centerThreshold
        }
    }

    private func nearestCell(to coord: CLLocationCoordinate2D) -> GridCell? {
        var best: GridCell?
        var bestD = Double.infinity
        for cell in heatmapCells {
            let d = dist(cell.lat, cell.lng, coord.latitude, coord.longitude)
            if d < bestD { bestD = d; best = cell }
        }
        return bestD < 0.001 ? best : nil
    }
}

struct ClusterBadge: View {
    let cluster: PostCluster
    let currentUserId: String?
    let onTap: () -> Void

    var body: some View {
        if cluster.count == 1, let post = cluster.singlePost {
            Button(action: onTap) {
                SinglePostPin(post: post, isPending: cluster.isPending, currentUserId: currentUserId)
            }
            .buttonStyle(.plain)
        } else {
            Text("\(cluster.count)")
                .font(.caption)
                .padding(8)
                .background(Color.accentColor)
                .foregroundColor(.white)
                .clipShape(Circle())
        }
    }
}

struct SinglePostPin: View {
    let post: Post
    let isPending: Bool
    let currentUserId: String?

    @State private var bounceOffset: CGFloat = 0

    private var isMine: Bool { currentUserId != nil && post.user_id == currentUserId }
    private var isHighlighted: Bool { !isMine && !post.watched }

    private var ageHours: Double {
        Double(Date().timeIntervalSince1970 - TimeInterval(post.created_at) / 1000) / 3600
    }

    private var borderColor: Color {
        guard isHighlighted else { return .white.opacity(0.5) }
        if ageHours > 20 { return .red }
        if ageHours > 12 { return .yellow }
        return .white
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
                Circle()
                    .fill(Color.black.opacity(0.25))
                    .frame(width: 52, height: 52)
                    .overlay(
                        Circle()
                            .stroke(borderColor, lineWidth: 2.5)
                    )
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
                    .frame(width: 46, height: 46)
                    .clipShape(Circle())
                } else {
                    fallbackIcon
                        .frame(width: 46, height: 46)
                        .clipShape(Circle())
                }
            }
            .offset(y: bounceOffset)
            .onAppear { startBounce() }
            .onChange(of: post.id) { _, _ in
                bounceOffset = 0
                startBounce()
            }

            if isPending {
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

private func heatColor(_ heat: Int) -> Color {
    if heat >= 10 { return .red }
    if heat >= 5 { return .orange }
    if heat >= 2 { return .yellow }
    return .mint
}

private func makeCoords(lat: Double, lng: Double, size: Double) -> [CLLocationCoordinate2D] {
    return [
        CLLocationCoordinate2D(latitude: lat - size, longitude: lng - size),
        CLLocationCoordinate2D(latitude: lat - size, longitude: lng + size),
        CLLocationCoordinate2D(latitude: lat + size, longitude: lng + size),
        CLLocationCoordinate2D(latitude: lat + size, longitude: lng - size),
        CLLocationCoordinate2D(latitude: lat - size, longitude: lng - size),
    ]
}

private func dist(_ lat1: Double, _ lng1: Double, _ lat2: Double, _ lng2: Double) -> Double {
    let dlat = lat1 - lat2
    let dlng = lng1 - lng2
    return sqrt(dlat * dlat + dlng * dlng)
}

struct PostCluster: Identifiable {
    let id: String
    let coord: CLLocationCoordinate2D
    let count: Int
    let singlePost: Post?
    let postType: Post.MediaType
    let isPending: Bool
    var label: String { singlePost?.type.rawValue.capitalized ?? "\(count)" }
}

private func makeClusters(_ posts: [Post], pendingIds: Set<String>) -> [PostCluster] {
    let radius = 0.0008
    var used = Set<String>()
    var clusters: [PostCluster] = []

    for post in posts {
        guard !used.contains(post.id) else { continue }
        var nearby = [post]
        for other in posts {
            guard !used.contains(other.id), other.id != post.id else { continue }
            if dist(post.lat, post.lng, other.lat, other.lng) < radius {
                nearby.append(other)
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
            postType: typeOf(nearby),
            isPending: anyPending
        ))
    }
    return clusters
}

private func typeOf(_ posts: [Post]) -> Post.MediaType {
    if posts.contains(where: { $0.type == .video }) { return .video }
    if posts.contains(where: { $0.type == .photo }) { return .photo }
    return .text
}
