import SwiftUI
import MapKit

struct MapKitMapView: View {
    let zoom: Double
    let posts: [Post]
    let mediaRequests: [MediaRequest]
    let previewRequestPin: CLLocationCoordinate2D?
    let currentUserId: String?
    let initialRegion: MKCoordinateRegion
    let onRegionChange: (Double, Double, Double, Double) -> Void
    let onCameraSettled: (MKCoordinateRegion) -> Void
    let onTapPost: (Post, MapBBox) -> Void
    let onTapCluster: (PostCluster, MapBBox) -> Void
    let onRequestPinDrop: (CLLocationCoordinate2D) -> Void

    @State private var camera: MapCameraPosition
    @State private var visibleRegion: MKCoordinateRegion

    init(
        zoom: Double,
        posts: [Post],
        mediaRequests: [MediaRequest],
        previewRequestPin: CLLocationCoordinate2D?,
        currentUserId: String?,
        initialRegion: MKCoordinateRegion,
        onRegionChange: @escaping (Double, Double, Double, Double) -> Void,
        onCameraSettled: @escaping (MKCoordinateRegion) -> Void,
        onTapPost: @escaping (Post, MapBBox) -> Void,
        onTapCluster: @escaping (PostCluster, MapBBox) -> Void,
        onRequestPinDrop: @escaping (CLLocationCoordinate2D) -> Void
    ) {
        self.zoom = zoom
        self.posts = posts
        self.mediaRequests = mediaRequests
        self.previewRequestPin = previewRequestPin
        self.currentUserId = currentUserId
        self.initialRegion = initialRegion
        self.onRegionChange = onRegionChange
        self.onCameraSettled = onCameraSettled
        self.onTapPost = onTapPost
        self.onTapCluster = onTapCluster
        self.onRequestPinDrop = onRequestPinDrop
        self._camera = State(initialValue: .camera(MapKitMapView.tiltedCamera(center: initialRegion.center, region: initialRegion)))
        self._visibleRegion = State(initialValue: initialRegion)
    }

    private static let pitchDegrees: Double = 60
    private static let maxDistance: CLLocationDistance = 20_000

    private static func cameraDistance(for region: MKCoordinateRegion) -> CLLocationDistance {
        let meters = region.span.latitudeDelta * 111_320
        return meters / sin(pitchDegrees * .pi / 180)
    }

    private static func tiltedCamera(center: CLLocationCoordinate2D, region: MKCoordinateRegion) -> MapCamera {
        MapCamera(
            centerCoordinate: center,
            distance: cameraDistance(for: region),
            heading: 0,
            pitch: pitchDegrees
        )
    }

    // Full zoom-out (max visible area), centered on the given coordinate.
    private static func maxOutCamera(center: CLLocationCoordinate2D) -> MapCamera {
        MapCamera(
            centerCoordinate: center,
            distance: maxDistance,
            heading: 0,
            pitch: pitchDegrees
        )
    }

    var body: some View {
        MapReader { proxy in
            Map(
                position: $camera,
                bounds: MapCameraBounds(minimumDistance: 500, maximumDistance: Self.maxDistance),
                interactionModes: [.pan, .zoom]
            ) {
                UserAnnotation()

                ForEach(makeClusters(posts)) { cluster in
                    Annotation(coordinate: cluster.coord, anchor: .center) {
                        ClusterBadge(
                            cluster: cluster,
                            currentUserId: currentUserId,
                            onTap: {
                                let bbox = bbox(from: visibleRegion)
                                if cluster.count == 1, let post = cluster.singlePost {
                                    onTapPost(post, bbox)
                                } else {
                                    onTapCluster(cluster, bbox)
                                }
                            }
                        )
                    } label: { EmptyView() }
                }

                ForEach(mediaRequests) { request in
                    Annotation(coordinate: request.coordinate, anchor: .center) {
                        RequestPinBadge(request: request)
                    } label: { EmptyView() }
                }

                if let preview = previewRequestPin {
                    Annotation(coordinate: preview, anchor: .center) {
                        RequestPinBadge(
                            request: MediaRequest(
                                id: "preview",
                                user_id: "",
                                lat: preview.latitude,
                                lng: preview.longitude,
                                created_at: Int64(Date().timeIntervalSince1970 * 1000)
                            )
                        )
                    } label: { EmptyView() }
                }
            }
            .mapStyle(.standard(elevation: .realistic, pointsOfInterest: .excludingAll))
            .simultaneousGesture(
                LongPressGesture(minimumDuration: 0.5)
                    .sequenced(before: DragGesture(minimumDistance: 0))
                    .onEnded { value in
                        guard case .second(true, let drag?) = value else { return }
                        guard let coordinate = proxy.convert(drag.startLocation, from: .local) else { return }
                        onRequestPinDrop(coordinate)
                    }
            )
            .onMapCameraChange(frequency: .onEnd) { ctx in
                let region = ctx.region
                visibleRegion = region
                let swLat = region.center.latitude - region.span.latitudeDelta / 2
                let swLng = region.center.longitude - region.span.longitudeDelta / 2
                let neLat = region.center.latitude + region.span.latitudeDelta / 2
                let neLng = region.center.longitude + region.span.longitudeDelta / 2
                onRegionChange(swLat, swLng, neLat, neLng)
                onCameraSettled(region)
            }
            .onReceive(NotificationCenter.default.publisher(for: .flyToCity)) { note in
                guard let city = note.object as? City else { return }
                flyTo(city: city)
            }
            .onReceive(NotificationCenter.default.publisher(for: .scrollToPost)) { note in
                guard let post = note.object as? Post else { return }
                withAnimation(.easeInOut(duration: 0.6)) {
                    let region = MKCoordinateRegion(
                        center: post.coordinate,
                        span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
                    )
                    camera = .camera(MapKitMapView.tiltedCamera(center: post.coordinate, region: region))
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: .centerMapOnRequest)) { note in
                guard let payload = note.object as? MapCenterPayload else { return }
                centerOn(payload)
            }
            .onAppear {
                if let payload = NotificationDelegate.consumePendingCenter() {
                    centerOn(payload)
                }
            }
        }
    }

    private func centerOn(_ payload: MapCenterPayload) {
        let coordinate = CLLocationCoordinate2D(latitude: payload.lat, longitude: payload.lng)
        withAnimation(.easeInOut(duration: 0.6)) {
            let region = MKCoordinateRegion(
                center: coordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
            )
            camera = .camera(MapKitMapView.tiltedCamera(center: coordinate, region: region))
        }
    }

    private func flyTo(city: City) {
        withAnimation(.easeInOut(duration: 1.2)) {
            camera = .camera(MapKitMapView.maxOutCamera(center: city.center))
        }
    }

    private func bbox(from region: MKCoordinateRegion) -> MapBBox {
        MapBBox(
            swLat: region.center.latitude - region.span.latitudeDelta / 2,
            swLng: region.center.longitude - region.span.longitudeDelta / 2,
            neLat: region.center.latitude + region.span.latitudeDelta / 2,
            neLng: region.center.longitude + region.span.longitudeDelta / 2
        )
    }
}

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
                Button(action: onTap) {
                    SinglePostPin(post: post, currentUserId: currentUserId)
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
        ZStack(alignment: .topLeading) {
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
            .opacity(post.watched && !post.isEvent ? 0.4 : 1)
            .saturation(post.watched && !post.isEvent ? 0.3 : 1)
            .offset(y: bounceOffset)
        }
        .overlay(alignment: .topTrailing) {
            if post.watched && !post.isEvent {
                Image(systemName: "eye.slash.fill")
                    .font(.system(size: 9))
                    .foregroundColor(.red)
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
    type == .video ? "video.fill" : "photo.fill"
}

/// Non-clickable "?" drop pin asking others in the area for a live view. Same shape as the media
/// pin, TTL 4h, ring colors: white → yellow (>1h) → red (>3h).
struct RequestPinBadge: View {
    let request: MediaRequest

    private static let ttlHours: TimeInterval = 4

    private var ringColor: Color {
        if request.ageHours > 3 { return .red }
        if request.ageHours > 1 { return .yellow }
        return .white
    }

    private func progress(at date: Date) -> Double {
        let elapsed = date.timeIntervalSince1970 - TimeInterval(request.created_at) / 1000
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

            ZStack {
                Circle()
                    .fill(Color.white.opacity(0.95))
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
}

private func makeClusters(_ posts: [Post]) -> [PostCluster] {
    let mediaPosts = posts
    let radius = 0.0008
    var used = Set<String>()
    var clusters: [PostCluster] = []

    for post in mediaPosts {
        guard !used.contains(post.id) else { continue }
        var nearby = [post]
        // Events cluster regardless of seen state (re-viewable); live groups only unseen.
        if !post.watched || post.isEvent {
            for other in mediaPosts {
                guard !used.contains(other.id), other.id != post.id, (!other.watched || other.isEvent) else { continue }
                if dist(post.lat, post.lng, other.lat, other.lng) < radius {
                    nearby.append(other)
                }
            }
        }
        nearby.forEach { used.insert($0.id) }
        let avgLat = nearby.map(\.lat).reduce(0, +) / Double(nearby.count)
        let avgLng = nearby.map(\.lng).reduce(0, +) / Double(nearby.count)
        clusters.append(PostCluster(
            id: post.id,
            coord: CLLocationCoordinate2D(latitude: avgLat, longitude: avgLng),
            count: nearby.count,
            singlePost: nearby.count == 1 ? nearby.first : nil,
            posts: nearby
        ))
    }
    // Render seen (watched) pins first so unseen pins/groups are drawn on top and
    // never get covered by a non-clickable seen pin at the same location.
    clusters.sort { a, b in
        let aWatched = a.count == 1 && a.singlePost?.watched == true
        let bWatched = b.count == 1 && b.singlePost?.watched == true
        return aWatched && !bWatched
    }
    return clusters
}
