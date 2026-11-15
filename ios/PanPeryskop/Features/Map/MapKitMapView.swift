import SwiftUI
import MapKit

struct MapKitMapView: View {
    let overlays: [MapOverlay]
    let currentUserId: String?
    let initialRegion: MKCoordinateRegion
    let initialDistance: CLLocationDistance?
    let maxZoomOutDistance: CLLocationDistance
    let clusterConfig: ClusterConfig
    let onRegionChange: (Double, Double, Double, Double) -> Void
    let onCameraSettled: (MKCoordinateRegion) -> Void
    let onTap: (MapOverlay) -> Void
    let cameraController: MapCameraController

    @State private var camera: MapCameraPosition
    @State private var visibleRegion: MKCoordinateRegion
    @State private var currentCameraDistance: CLLocationDistance
    @State private var derived = Derived()
    @State private var arcs: [RenderedArc] = []
    @State private var allClusters: [MapCluster] = []
    @State private var clusteredRadius: Double = 0
    @State private var mapSize: CGSize = .zero

    private struct RenderedArc: Identifiable {
        let id: String
        let color: Color
        let polyline: MKPolyline
    }

    private struct OverlayFingerprint: Equatable {
        let count: Int
        let hash: Int
    }

    private var arcsFingerprint: OverlayFingerprint {
        var hasher = Hasher()
        var count = 0
        for overlay in overlays where Self.hashArc(overlay, into: &hasher) {
            count += 1
        }
        return OverlayFingerprint(count: count, hash: hasher.finalize())
    }

    private var airportsFingerprint: OverlayFingerprint {
        var hasher = Hasher()
        var count = 0
        for overlay in overlays where Self.hashAirport(overlay, into: &hasher) {
            count += 1
        }
        return OverlayFingerprint(count: count, hash: hasher.finalize())
    }

    private var clusterFingerprint: OverlayFingerprint {
        var hasher = Hasher()
        hasher.combine(clusterConfig.radiusPixels)
        hasher.combine(clusterConfig.longitudeScale)
        hasher.combine(clusterConfig.anchor.latitude)
        hasher.combine(clusterConfig.anchor.longitude)
        var count = 0
        for overlay in overlays where Self.hashClusterOverlay(overlay, into: &hasher) {
            count += 1
        }
        return OverlayFingerprint(count: count, hash: hasher.finalize())
    }

    private struct Derived {
        var clusters: [MapCluster] = []
        var airports: [AirportPin] = []
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
        clusterConfig: ClusterConfig,
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
        self.clusterConfig = clusterConfig
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
        let height = mapSize.height > 0 ? mapSize.height : UIScreen.main.bounds.height
        let degreesPerPixel = visibleRegion.span.latitudeDelta / max(Double(height), 1)
        return max(degreesPerPixel * clusterConfig.radiusPixels, 0.00005)
    }

    private func handleRegionChange() {
        guard !reclusterIfRadiusChanged() else { return }
        refreshVisible()
    }

    private func reclusterIfRadiusChanged() -> Bool {
        let radius = clusterRadiusDegrees
        guard clusteredRadius == 0 || abs(radius - clusteredRadius) / clusteredRadius > 0.2 else { return false }
        recluster()
        return true
    }

    private func flightArcs(_ visible: [MapOverlay]) -> [RenderedArc] {
        visible.compactMap(Self.renderedArc)
    }

    private static func renderedArc(from overlay: MapOverlay) -> RenderedArc? {
        guard case .arc(let arc) = overlay else { return nil }
        return RenderedArc(id: arc.id, color: arc.color, polyline: arc.polyline)
    }

    private func recluster() {
        let items = overlays.compactMap(Self.clusterItem)
        let radius = clusterRadiusDegrees
        clusteredRadius = radius
        allClusters = clusterItems(items, radiusDegrees: radius, config: clusterConfig)
        refreshVisible()
    }

    private static func clusterItem(from overlay: MapOverlay) -> MapClusterItem? {
        switch overlay {
        case .city(let pin): return .city(pin.city)
        case .pin(let pin): return .post(pin.post)
        case .airport, .arc, .group: return nil
        }
    }

    private func visibleBounds() -> MapBBox {
        let pad = clusterRadiusDegrees * 2
        return MapBBox(
            swLat: visibleRegion.center.latitude - visibleRegion.span.latitudeDelta / 2 - pad,
            swLng: visibleRegion.center.longitude - visibleRegion.span.longitudeDelta / 2 - pad,
            neLat: visibleRegion.center.latitude + visibleRegion.span.latitudeDelta / 2 + pad,
            neLng: visibleRegion.center.longitude + visibleRegion.span.longitudeDelta / 2 + pad
        )
    }

    private func refreshVisible() {
        let box = visibleBounds()
        derived = Derived(
            clusters: allClusters.filter { box.contains(lat: $0.coord.latitude, lng: $0.coord.longitude) },
            airports: overlays.compactMap { Self.airportPin(from: $0, in: box) }
        )
    }

    private static func airportPin(from overlay: MapOverlay, in box: MapBBox) -> AirportPin? {
        guard case .airport(let pin) = overlay,
              box.contains(lat: pin.coord.latitude, lng: pin.coord.longitude) else { return nil }
        return pin
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
        if cluster.count == 1, let single = Self.singleTapOverlay(from: cluster.items.first) {
            return single
        }
        return .group(MapGroup(id: cluster.id, posts: cluster.posts, cities: cluster.cities))
    }

    private static func singleTapOverlay(from item: MapClusterItem?) -> MapOverlay? {
        guard let item else { return nil }
        if let post = item.post { return .pin(MapPin(post: post)) }
        if let city = item.city { return .city(CityPin(city: city)) }
        return nil
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
                        Annotation(coordinate: pin.coord, anchor: .center) {
                            airportPinView(pin, scale: scale)
                        } label: { EmptyView() }
                    }
                }
                .mapStyle(.standard(elevation: Self.usesRealisticTerrain ? .realistic : .flat, pointsOfInterest: .excludingAll))
                .onMapCameraChange(frequency: .onEnd) { ctx in
                    handleMapCameraEnd(ctx.region)
                }
                .onChange(of: geo.size) { _, newSize in
                    mapSize = newSize
                }
                .onChange(of: regionKey) { _, _ in
                    handleRegionChange()
                }
                // Keep arcs separate from clusterFingerprint so loading arc animations never recluster pins.
                .onChange(of: arcsFingerprint) { _, _ in
                    arcs = flightArcs(overlays)
                }
                .onChange(of: airportsFingerprint) { _, _ in
                    refreshVisible()
                }
                .onChange(of: clusterFingerprint) { _, _ in
                    recluster()
                }
                .onAppear {
                    mapSize = geo.size
                    arcs = flightArcs(overlays)
                    recluster()
                    bindCameraController(proxy: proxy)
                }
                .onReceive(NotificationCenter.default.publisher(for: .scrollToPost)) { note in
                    guard let post = note.object as? Post else { return }
                    scrollToPost(post)
                }
                .onReceive(NotificationCenter.default.publisher(for: .centerMapOnCoordinate)) { note in
                    guard let payload = note.object as? MapCenterPayload else { return }
                    centerOnCoordinate(payload)
                }
            }
        }
    }

    @ViewBuilder
    private func airportPinView(_ pin: AirportPin, scale: CGFloat) -> some View {
        if pin.isOrigin {
            OriginAirportPin(iata: pin.iata, airlines: pin.airlines)
        } else {
            AirportPinBadge(iata: pin.iata, airlines: pin.airlines, shimmer: pin.shimmer)
                .scaleEffect(scale)
                .onTapGesture { onTap(.airport(pin)) }
        }
    }

    private func handleMapCameraEnd(_ region: MKCoordinateRegion) {
        visibleRegion = region
        currentCameraDistance = Self.cameraDistance(for: region)
        let swLat = region.center.latitude - region.span.latitudeDelta / 2
        let swLng = region.center.longitude - region.span.longitudeDelta / 2
        let neLat = region.center.latitude + region.span.latitudeDelta / 2
        let neLng = region.center.longitude + region.span.longitudeDelta / 2
        onRegionChange(swLat, swLng, neLat, neLng)
        onCameraSettled(region)
    }

    private func bindCameraController(proxy: MapProxy) {
        cameraController.bind { region, distance in
            flyCamera(to: region, distance: distance)
        }
        cameraController.bindAvoidingSheet { coordinate in
            moveCameraAvoidingSheet(to: coordinate, proxy: proxy)
        }
    }

    private func flyCamera(to region: MKCoordinateRegion, distance: CLLocationDistance?) {
        visibleRegion = region
        let resolved = distance ?? Self.cameraDistance(for: region)
        currentCameraDistance = resolved
        withAnimation(.easeInOut(duration: 1.2)) {
            camera = .camera(Self.tiltedCamera(
                center: region.center,
                region: region,
                distance: resolved
            ))
        }
    }

    private func moveCameraAvoidingSheet(to coordinate: CLLocationCoordinate2D, proxy: MapProxy) {
        let target = CGPoint(
            x: mapSize.width * Self.sheetAvoidFraction.x,
            y: mapSize.height * Self.sheetAvoidFraction.y
        )
        guard let targetCoord = proxy.convert(target, from: .local) else {
            camera = .camera(currentDistanceCamera(center: coordinate))
            return
        }
        let center = visibleRegion.center
        let newCenter = CLLocationCoordinate2D(
            latitude: center.latitude + coordinate.latitude - targetCoord.latitude,
            longitude: center.longitude + coordinate.longitude - targetCoord.longitude
        )
        visibleRegion = MKCoordinateRegion(center: newCenter, span: visibleRegion.span)
        withAnimation(.easeInOut(duration: 0.6)) {
            camera = .camera(currentDistanceCamera(center: newCenter))
        }
    }

    private func currentDistanceCamera(center: CLLocationCoordinate2D) -> MapCamera {
        MapCamera(
            centerCoordinate: center,
            distance: currentCameraDistance,
            heading: 0,
            pitch: Self.pitchDegrees
        )
    }

    private func scrollToPost(_ post: Post) {
        let region = MKCoordinateRegion(
            center: post.coordinate,
            span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
        )
        withAnimation(.easeInOut(duration: 0.6)) {
            camera = .camera(Self.tiltedCamera(center: post.coordinate, region: region))
        }
    }

    private func centerOnCoordinate(_ payload: MapCenterPayload) {
        let target = targetCamera(for: payload)
        withAnimation(.easeInOut(duration: 0.6)) {
            camera = .camera(target)
        }
    }

    private func targetCamera(for payload: MapCenterPayload) -> MapCamera {
        let coordinate = CLLocationCoordinate2D(latitude: payload.lat, longitude: payload.lng)
        guard payload.zoomIn else {
            return currentDistanceCamera(center: coordinate)
        }
        let region = MKCoordinateRegion(
            center: coordinate,
            span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
        )
        return Self.tiltedCamera(center: coordinate, region: region)
    }

    private static func hashArc(_ overlay: MapOverlay, into hasher: inout Hasher) -> Bool {
        guard case .arc(let arc) = overlay else { return false }
        hasher.combine(arc.id)
        hasher.combine(arc.progress)
        hasher.combine(arc.bowOffset)
        hasher.combine(arc.from.latitude)
        hasher.combine(arc.from.longitude)
        hasher.combine(arc.to.latitude)
        hasher.combine(arc.to.longitude)
        hasher.combine(arc.airlines)
        return true
    }

    private static func hashAirport(_ overlay: MapOverlay, into hasher: inout Hasher) -> Bool {
        guard case .airport(let pin) = overlay else { return false }
        hasher.combine(pin.iata)
        hasher.combine(pin.coord.latitude)
        hasher.combine(pin.coord.longitude)
        hasher.combine(pin.isOrigin)
        hasher.combine(pin.shimmer)
        hasher.combine(pin.airlines)
        return true
    }

    private static func hashClusterOverlay(_ overlay: MapOverlay, into hasher: inout Hasher) -> Bool {
        switch overlay {
        case .pin(let pin):
            hasher.combine(0)
            hashPost(pin.post, into: &hasher)
            return true
        case .city(let pin):
            hasher.combine(1)
            hashCity(pin.city, into: &hasher)
            return true
        case .airport, .arc, .group:
            return false
        }
    }

    private static func hashPost(_ post: Post, into hasher: inout Hasher) {
        hasher.combine(post.id)
        hasher.combine(post.lat)
        hasher.combine(post.lng)
        hasher.combine(post.created_at)
        hasher.combine(post.likes_count)
        hasher.combine(post.views_count)
        hasher.combine(post.shares_count)
        hasher.combine(post.dislikes_count)
        hasher.combine(post.liked)
        hasher.combine(post.disliked)
        hasher.combine(post.watched)
        hasher.combine(post.is_sponsored)
        hasher.combine(post.is_sold_out)
        hasher.combine(post.description)
        hasher.combine(post.link_url)
        hasher.combine(post.thumb_url)
        hasher.combine(post.thumb_key)
        hasher.combine(post.media_url)
        hasher.combine(post.media_key)
        hasher.combine(post.tags)
        hasher.combine(post.distinction)
        hasher.combine(post.showtimes)
        hasher.combine(post.meta)
        hashTravelPin(post.travelPin, into: &hasher)
        hashShowtimeBookings(post.showtime_booking, into: &hasher)
    }

    private static func hashTravelPin(_ style: TravelPinStyle?, into hasher: inout Hasher) {
        guard let style else {
            hasher.combine(false)
            return
        }
        hasher.combine(true)
        hasher.combine(style.icon)
        hasher.combine(style.startHex)
        hasher.combine(style.endHex)
    }

    private static func hashShowtimeBookings(_ bookings: [ShowtimeBooking]?, into hasher: inout Hasher) {
        guard let bookings else {
            hasher.combine(-1)
            return
        }
        hasher.combine(bookings.count)
        for booking in bookings {
            hasher.combine(booking.time)
            hasher.combine(booking.kind)
            hasher.combine(booking.params)
        }
    }

    private static func hashCity(_ city: TravelCity, into hasher: inout Hasher) {
        hasher.combine(city.id)
        hasher.combine(city.lat)
        hasher.combine(city.lng)
        hasher.combine(city.countryCode)
        hasher.combine(city.imageUrl)
        hasher.combine(city.namePl)
        hasher.combine(city.bandRank)
    }
}
