import SwiftUI
import MapKit

struct MapKitMapView: View {
    let overlays: [MapOverlay]
    let previewRequestPin: CLLocationCoordinate2D?
    let currentUserId: String?
    let initialRegion: MKCoordinateRegion
    let zoom: Double
    let maxZoomOutDistance: CLLocationDistance
    let onRegionChange: (Double, Double, Double, Double) -> Void
    let onCameraSettled: (MKCoordinateRegion) -> Void
    let onTap: (MapOverlay) -> Void
    let onRequestPinDrop: (CLLocationCoordinate2D) -> Void
    let cameraController: MapCameraController

    @State private var camera: MapCameraPosition
    @State private var visibleRegion: MKCoordinateRegion
    @State private var currentCameraDistance: CLLocationDistance

    init(
        overlays: [MapOverlay],
        previewRequestPin: CLLocationCoordinate2D?,
        currentUserId: String?,
        initialRegion: MKCoordinateRegion,
        zoom: Double,
        maxZoomOutDistance: CLLocationDistance,
        onRegionChange: @escaping (Double, Double, Double, Double) -> Void,
        onCameraSettled: @escaping (MKCoordinateRegion) -> Void,
        onTap: @escaping (MapOverlay) -> Void,
        onRequestPinDrop: @escaping (CLLocationCoordinate2D) -> Void,
        cameraController: MapCameraController
    ) {
        self.overlays = overlays
        self.previewRequestPin = previewRequestPin
        self.currentUserId = currentUserId
        self.initialRegion = initialRegion
        self.zoom = zoom
        self.maxZoomOutDistance = maxZoomOutDistance
        self.onRegionChange = onRegionChange
        self.onCameraSettled = onCameraSettled
        self.onTap = onTap
        self.onRequestPinDrop = onRequestPinDrop
        self.cameraController = cameraController
        self._camera = State(initialValue: .camera(MapKitMapView.tiltedCamera(center: initialRegion.center, region: initialRegion)))
        self._visibleRegion = State(initialValue: initialRegion)
        self._currentCameraDistance = State(initialValue: MapKitMapView.cameraDistance(for: initialRegion))
    }

    private static let pitchDegrees: Double = 60
    /// Screen fraction where a tapped pin is placed (see `MapCameraController.flyToAboveSheet`).
    private static let sheetAvoidFraction = CGPoint(x: 0.5, y: 0.25)
    /// City fly framing distance — the city map's default camera height.
    private static let cityFlyDistance: CLLocationDistance = 60_000
    private static let clusterPixels: Double = 48

    private var clusterRadiusDegrees: Double {
        let screenHeight = UIScreen.main.bounds.height
        let degreesPerPixel = visibleRegion.span.latitudeDelta / Double(screenHeight)
        return max(degreesPerPixel * Self.clusterPixels, 0.00005)
    }

    /// Overlays within the visible region (+ cluster padding) — only visible content
    /// is clustered/rendered, so a stale pin never skews a cluster near the edge.
    private var visibleOverlays: [MapOverlay] {
        let pad = clusterRadiusDegrees
        let lat0 = visibleRegion.center.latitude - visibleRegion.span.latitudeDelta / 2 - pad
        let lat1 = visibleRegion.center.latitude + visibleRegion.span.latitudeDelta / 2 + pad
        let lng0 = visibleRegion.center.longitude - visibleRegion.span.longitudeDelta / 2 - pad
        let lng1 = visibleRegion.center.longitude + visibleRegion.span.longitudeDelta / 2 + pad
        return overlays.filter {
            switch $0 {
            case .pin(let p):
                return p.post.lat >= lat0 && p.post.lat <= lat1 && p.post.lng >= lng0 && p.post.lng <= lng1
            case .airport(let a):
                return a.coord.latitude >= lat0 && a.coord.latitude <= lat1 && a.coord.longitude >= lng0 && a.coord.longitude <= lng1
            case .request(let r):
                return r.lat >= lat0 && r.lat <= lat1 && r.lng >= lng0 && r.lng <= lng1
            case .arc:
                return true
            }
        }
    }

    private var pinClusters: [PostCluster] {
        let pins = visibleOverlays.compactMap { overlay -> Post? in
            if case .pin(let p) = overlay { return p.post }
            return nil
        }
        return makeClusters(pins, radiusDegrees: clusterRadiusDegrees)
    }

    private var airportPins: [AirportPin] {
        visibleOverlays.compactMap { overlay in
            if case .airport(let a) = overlay { return a }
            return nil
        }
    }

    private var flightArcs: [FlightArc] {
        visibleOverlays.compactMap { overlay in
            if case .arc(let a) = overlay { return a }
            return nil
        }
    }

    private var requestPins: [MediaRequest] {
        visibleOverlays.compactMap { overlay in
            if case .request(let r) = overlay { return r }
            return nil
        }
    }

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

    private static func maxOutCamera(center: CLLocationCoordinate2D) -> MapCamera {
        MapCamera(
            centerCoordinate: center,
            distance: cityFlyDistance,
            heading: 0,
            pitch: pitchDegrees
        )
    }

    var body: some View {
        GeometryReader { geo in
            MapReader { proxy in
                Map(
                position: $camera,
                bounds: MapCameraBounds(minimumDistance: 500, maximumDistance: maxZoomOutDistance),
                interactionModes: [.pan, .zoom]
            ) {
                UserAnnotation()

                ForEach(flightArcs) { arc in
                    MapPolyline(arc.polyline)
                        .stroke(arc.color, lineWidth: 2.5)
                }

                ForEach(pinClusters) { cluster in
                    Annotation(coordinate: cluster.coord, anchor: .center) {
                        ClusterBadge(
                            cluster: cluster,
                            currentUserId: currentUserId,
                            onTap: {
                                onTap(.pin(MapPin(post: cluster.singlePost ?? cluster.posts[0], group: cluster.posts)))
                            }
                        )
                    } label: { EmptyView() }
                }

                ForEach(airportPins) { pin in
                    if pin.isOrigin {
                        Annotation(coordinate: pin.coord, anchor: .center) {
                            OriginAirportPin(iata: pin.iata, airlines: pin.airlines)
                        } label: { EmptyView() }
                    } else {
                        Annotation(coordinate: pin.coord, anchor: .center) {
                            AirportPinBadge(iata: pin.iata, airlines: pin.airlines)
                                .onTapGesture { onTap(.airport(pin)) }
                        } label: { EmptyView() }
                    }
                }

                ForEach(requestPins) { request in
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
                currentCameraDistance = Self.cameraDistance(for: region)
                let swLat = region.center.latitude - region.span.latitudeDelta / 2
                let swLng = region.center.longitude - region.span.longitudeDelta / 2
                let neLat = region.center.latitude + region.span.latitudeDelta / 2
                let neLng = region.center.longitude + region.span.longitudeDelta / 2
                onRegionChange(swLat, swLng, neLat, neLng)
                onCameraSettled(region)
            }
            .onAppear {
                cameraController.bind { region in
                    withAnimation(.easeInOut(duration: 1.2)) {
                        camera = .camera(MapKitMapView.tiltedCamera(center: region.center, region: region))
                    }
                }
                cameraController.bindAvoidingSheet { coordinate in
                    let size = geo.size
                    let target = CGPoint(
                        x: size.width * Self.sheetAvoidFraction.x,
                        y: size.height * Self.sheetAvoidFraction.y
                    )
                    guard let targetCoord = proxy.convert(target, from: .local) else {
                        camera = .camera(MapCamera(
                            centerCoordinate: coordinate,
                            distance: currentCameraDistance,
                            heading: 0,
                            pitch: Self.pitchDegrees
                        ))
                        return
                    }
                    // Exact for a tilted camera: the projection is translation-
                    // equivariant in ground space, so shifting the center by the
                    // ground vector (pin − targetCoord) lands the pin on `target`
                    // even at 60° pitch. A screen-space translation would not.
                    let center = visibleRegion.center
                    let newCenter = CLLocationCoordinate2D(
                        latitude: center.latitude + coordinate.latitude - targetCoord.latitude,
                        longitude: center.longitude + coordinate.longitude - targetCoord.longitude
                    )
                    withAnimation(.easeInOut(duration: 0.6)) {
                        camera = .camera(MapCamera(
                            centerCoordinate: newCenter,
                            distance: currentCameraDistance,
                            heading: 0,
                            pitch: Self.pitchDegrees
                        ))
                    }
                }
                if let payload = NotificationDelegate.consumePendingCenter() {
                    centerOn(payload)
                }
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
}

struct PostCluster: Identifiable {
    let id: String
    let coord: CLLocationCoordinate2D
    let count: Int
    let singlePost: Post?
    let posts: [Post]
}

private func makeClusters(_ posts: [Post], radiusDegrees: Double) -> [PostCluster] {
    let radius = radiusDegrees
    var used = Set<String>()
    var clusters: [PostCluster] = []

    for post in posts {
        guard !used.contains(post.id) else { continue }
        var nearby = [post]
        if !post.watched || post.isEvent {
            for other in posts {
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
            id: nearby.map(\.id).min() ?? post.id,
            coord: CLLocationCoordinate2D(latitude: avgLat, longitude: avgLng),
            count: nearby.count,
            singlePost: nearby.count == 1 ? nearby.first : nil,
            posts: nearby
        ))
    }
    clusters.sort { a, b in
        let aWatched = a.count == 1 && a.singlePost?.watched == true
        let bWatched = b.count == 1 && b.singlePost?.watched == true
        return aWatched && !bWatched
    }
    return clusters
}

private func dist(_ lat1: Double, _ lng1: Double, _ lat2: Double, _ lng2: Double) -> Double {
    let dlat = lat1 - lat2
    let dlng = lng1 - lng2
    return sqrt(dlat * dlat + dlng * dlng)
}
