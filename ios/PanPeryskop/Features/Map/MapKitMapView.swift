import SwiftUI
import MapKit

struct MapKitMapView: View {
    let overlays: [MapOverlay]
    let currentUserId: String?
    let initialRegion: MKCoordinateRegion
    let initialDistance: CLLocationDistance?
    let maxZoomOutDistance: CLLocationDistance
    let onRegionChange: (Double, Double, Double, Double) -> Void
    let onCameraSettled: (MKCoordinateRegion) -> Void
    let onTap: (MapOverlay) -> Void
    let cameraController: MapCameraController

    @State private var camera: MapCameraPosition
    @State private var visibleRegion: MKCoordinateRegion
    @State private var currentCameraDistance: CLLocationDistance
    @State private var derived = Derived()
    @State private var arcs: [FlightArc] = []
    @State private var allClusters: [MapCluster] = []

    @State private var clusteredRadius: Double = 0

    private var arcsFingerprint: String {
        var parts: [String] = []
        for overlay in overlays {
            guard case .arc(let arc) = overlay else { continue }
            parts.append("\(arc.id):\(arc.progress)")
            if parts.count >= 40 { break }
        }
        return parts.joined(separator: "|")
    }

    private struct Derived {
        var clusters: [MapCluster] = []
        var airports: [AirportPin] = []
    }

    private var overlaysFingerprint: String {
        "\(overlays.count)|\(overlays.first?.id ?? "")|\(overlays.last?.id ?? "")"
    }

    private struct RegionKey: Equatable {
        let lat: Double
        let lng: Double
        let dLat: Double
        let dLng: Double
    }

    private var regionKey: RegionKey {
        RegionKey(
            lat: visibleRegion.center.latitude,
            lng: visibleRegion.center.longitude,
            dLat: visibleRegion.span.latitudeDelta,
            dLng: visibleRegion.span.longitudeDelta
        )
    }

    init(
        overlays: [MapOverlay],
        currentUserId: String?,
        initialRegion: MKCoordinateRegion,
        initialDistance: CLLocationDistance?,
        maxZoomOutDistance: CLLocationDistance,
        onRegionChange: @escaping (Double, Double, Double, Double) -> Void,
        onCameraSettled: @escaping (MKCoordinateRegion) -> Void,
        onTap: @escaping (MapOverlay) -> Void,
        cameraController: MapCameraController
    ) {
        self.overlays = overlays
        self.currentUserId = currentUserId
        self.initialRegion = initialRegion
        self.initialDistance = initialDistance
        self.maxZoomOutDistance = maxZoomOutDistance
        self.onRegionChange = onRegionChange
        self.onCameraSettled = onCameraSettled
        self.onTap = onTap
        self.cameraController = cameraController
        let distance = initialDistance ?? MapKitMapView.cameraDistance(for: initialRegion)
        self._camera = State(initialValue: .camera(MapKitMapView.tiltedCamera(
            center: initialRegion.center,
            region: initialRegion,
            distance: distance
        )))
        self._visibleRegion = State(initialValue: initialRegion)
        self._currentCameraDistance = State(initialValue: distance)
    }

    private static let pitchDegrees: Double = 60
    private static let usesRealisticTerrain = false
    private static let sheetAvoidFraction = CGPoint(x: 0.5, y: 0.40)
    private static let clusterPixels: Double = 48
    private static let markerMinScale: CGFloat = 0.45
    private static let markerFullScaleSpan: Double = 2
    private static let markerMinScaleSpan: Double = 22

    private var zoomScale: CGFloat {
        let span = visibleRegion.span.latitudeDelta
        guard span > Self.markerFullScaleSpan else { return 1 }
        guard span < Self.markerMinScaleSpan else { return Self.markerMinScale }
        let t = (span - Self.markerFullScaleSpan) / (Self.markerMinScaleSpan - Self.markerFullScaleSpan)
        return 1 - CGFloat(t) * (1 - Self.markerMinScale)
    }
    private var clusterRadiusDegrees: Double {
        let screenHeight = UIScreen.main.bounds.height
        let degreesPerPixel = visibleRegion.span.latitudeDelta / Double(screenHeight)
        return max(degreesPerPixel * Self.clusterPixels, 0.00005)
    }

    private func reclusterIfRadiusChanged() {
        let radius = clusterRadiusDegrees
        guard clusteredRadius == 0 || abs(radius - clusteredRadius) / clusteredRadius > 0.2 else { return }
        recluster()
    }

    private func flightArcs(_ visible: [MapOverlay]) -> [FlightArc] {
        visible.compactMap { overlay in
            if case .arc(let a) = overlay { return a }
            return nil
        }
    }

    private func recluster() {
        var items: [MapClusterItem] = []
        for overlay in overlays {
            switch overlay {
            case .city(let pin): items.append(.city(pin.city))
            case .pin(let p): items.append(.post(p.post))
            case .airport, .arc, .group: continue
            }
        }
        let radius = clusterRadiusDegrees
        clusteredRadius = radius
        allClusters = clusterItems(items, radiusDegrees: radius)
        refreshVisible()
    }

    private func refreshVisible() {
        let pad = clusterRadiusDegrees
        let lat0 = visibleRegion.center.latitude - visibleRegion.span.latitudeDelta / 2 - pad
        let lat1 = visibleRegion.center.latitude + visibleRegion.span.latitudeDelta / 2 + pad
        let lng0 = visibleRegion.center.longitude - visibleRegion.span.longitudeDelta / 2 - pad
        let lng1 = visibleRegion.center.longitude + visibleRegion.span.longitudeDelta / 2 + pad
        func inBox(_ lat: Double, _ lng: Double) -> Bool {
            lat >= lat0 && lat <= lat1 && lng >= lng0 && lng <= lng1
        }

        var airports: [AirportPin] = []
        for overlay in overlays {
            switch overlay {
            case .airport(let a):
                guard inBox(a.coord.latitude, a.coord.longitude) else { continue }
                airports.append(a)
            case .pin, .city, .arc, .group:
                continue
            }
        }

        derived = Derived(
            clusters: allClusters.filter { inBox($0.coord.latitude, $0.coord.longitude) },
            airports: airports
        )
    }

    private static func cameraDistance(for region: MKCoordinateRegion) -> CLLocationDistance {
        let meters = region.span.latitudeDelta * 111_320
        return meters / sin(pitchDegrees * .pi / 180)
    }

    private static func tiltedCamera(
        center: CLLocationCoordinate2D,
        region: MKCoordinateRegion,
        distance: CLLocationDistance? = nil
    ) -> MapCamera {
        MapCamera(
            centerCoordinate: center,
            distance: distance ?? cameraDistance(for: region),
            heading: 0,
            pitch: pitchDegrees
        )
    }

    private func tap(for cluster: MapCluster) -> MapOverlay {
        if cluster.count == 1, let item = cluster.items.first {
            if let post = item.post { return .pin(MapPin(post: post)) }
            if let city = item.city { return .city(CityPin(city: city)) }
        }
        return .group(MapGroup(id: cluster.id, posts: cluster.posts, cities: cluster.cities))
    }

    var body: some View {
        let clusters = derived.clusters
        let airports = derived.airports
        let scale = zoomScale
        return GeometryReader { geo in
            MapReader { proxy in
                Map(
                position: $camera,
                bounds: MapCameraBounds(minimumDistance: 500, maximumDistance: maxZoomOutDistance),
                interactionModes: [.pan, .zoom]
            ) {
                UserAnnotation()

                ForEach(arcs) { arc in
                    MapPolyline(arc.polyline)
                        .stroke(arc.color, lineWidth: 2.5)
                }

                ForEach(clusters) { cluster in
                    Annotation(coordinate: cluster.coord, anchor: .center) {
                        ClusterBadge(
                            cluster: cluster,
                            currentUserId: currentUserId,
                            onTap: { onTap(tap(for: cluster)) }
                        )
                        .scaleEffect(scale)
                    } label: { EmptyView() }
                }

                ForEach(airports) { pin in
                    if pin.isOrigin {
                        Annotation(coordinate: pin.coord, anchor: .center) {
                            OriginAirportPin(iata: pin.iata, airlines: pin.airlines)
                        } label: { EmptyView() }
                    } else {
                        Annotation(coordinate: pin.coord, anchor: .center) {
                            AirportPinBadge(iata: pin.iata, airlines: pin.airlines, shimmer: pin.shimmer)
                                .scaleEffect(scale)
                                .onTapGesture { onTap(.airport(pin)) }
                        } label: { EmptyView() }
                    }
                }
            }
            .mapStyle(.standard(elevation: Self.usesRealisticTerrain ? .realistic : .flat, pointsOfInterest: .excludingAll))
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
            .onChange(of: regionKey) { _, _ in
                refreshVisible()
                reclusterIfRadiusChanged()
            }
            .onChange(of: arcsFingerprint) { _, _ in arcs = flightArcs(overlays) }
            .onChange(of: overlaysFingerprint) { _, _ in recluster() }
            .onAppear {
                arcs = flightArcs(overlays)
                recluster()
                cameraController.bind { region, distance in
                    visibleRegion = region
                    let resolved = distance ?? MapKitMapView.cameraDistance(for: region)
                    currentCameraDistance = resolved
                    withAnimation(.easeInOut(duration: 1.2)) {
                        camera = .camera(MapKitMapView.tiltedCamera(
                            center: region.center,
                            region: region,
                            distance: resolved
                        ))
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
                    let center = visibleRegion.center
                    let newCenter = CLLocationCoordinate2D(
                        latitude: center.latitude + coordinate.latitude - targetCoord.latitude,
                        longitude: center.longitude + coordinate.longitude - targetCoord.longitude
                    )
                    visibleRegion = MKCoordinateRegion(center: newCenter, span: visibleRegion.span)
                    withAnimation(.easeInOut(duration: 0.6)) {
                        camera = .camera(MapCamera(
                            centerCoordinate: newCenter,
                            distance: currentCameraDistance,
                            heading: 0,
                            pitch: Self.pitchDegrees
                        ))
                    }
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
            .onReceive(NotificationCenter.default.publisher(for: .centerMapOnCoordinate)) { note in
                guard let payload = note.object as? MapCenterPayload else { return }
                centerOnCoordinate(payload)
            }
            }
        }
    }

    private func centerOnCoordinate(_ payload: MapCenterPayload) {
        let coordinate = CLLocationCoordinate2D(latitude: payload.lat, longitude: payload.lng)
        withAnimation(.easeInOut(duration: 0.6)) {
            if payload.zoomIn {
                let region = MKCoordinateRegion(center: coordinate, span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01))
                camera = .camera(MapKitMapView.tiltedCamera(center: coordinate, region: region))
            } else {
                camera = .camera(MapCamera(
                    centerCoordinate: coordinate,
                    distance: currentCameraDistance,
                    heading: 0,
                    pitch: Self.pitchDegrees
                ))
            }
        }
    }
}
