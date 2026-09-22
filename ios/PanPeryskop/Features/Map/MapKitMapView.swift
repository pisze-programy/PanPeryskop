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

    /// The layers a render draws. Rebuilt only when the region settles or the
    /// data changes, never per animation frame.
    private struct Derived {
        var visible: [MapOverlay] = []
        var clusters: [PostCluster] = []
        var pins: [CityPin] = []
        var dots: [CityPin] = []
        var airports: [AirportPin] = []
    }

    /// A city layer declutters on quantized zoom bands. A band has a fixed cell
    /// size and a fixed pin cap, so which city is a pin depends on the city and
    /// the band — never on the exact camera. Panning changes nothing, and a zoom
    /// inside a band changes nothing, so pins cannot jump.
    private struct CityBand {
        let cellDegrees: Double
        let pinCap: Int
    }

    private static let cityBands: [CityBand] = [
        CityBand(cellDegrees: 6, pinCap: 18),
        CityBand(cellDegrees: 2, pinCap: 22),
        CityBand(cellDegrees: 0.6, pinCap: 60),
        CityBand(cellDegrees: 0.15, pinCap: 400),
    ]

    private var cityBandIndex: Int {
        let span = visibleRegion.span.latitudeDelta
        if span > 8 { return 0 }
        if span > 3 { return 1 }
        if span > 1 { return 2 }
        return 3
    }

    /// Cheap identity for the overlay list: a count plus the two ends.
    private var overlaysFingerprint: String {
        "\(overlays.count)|\(overlays.first?.id ?? "")|\(overlays.last?.id ?? "")"
    }

    /// `MKCoordinateRegion` is not Equatable, so the region needs a key.
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
    /// `.realistic` renders 3D terrain, which costs GPU on every frame of a
    /// camera move at this pitch. False is the measured value.
    private static let usesRealisticTerrain = false
    /// Screen fraction where a tapped pin is placed (see `MapCameraController.flyToAboveSheet`).
    private static let sheetAvoidFraction = CGPoint(x: 0.5, y: 0.40)
    private static let clusterPixels: Double = 48
    /// Marker scale at continent zoom and at city zoom. Between the two spans the
    /// scale is interpolated, so pins do not cover a whole country when zoomed out.
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

    /// A dense screen shrinks markers further, so the map stays readable.
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
            case .city:
                // The city layer is not viewport-clipped. MapKit does not draw
                // what is off screen, and clipping here made a pin pop in at the
                // edge as a full photo with no transition.
                return false
            case .airport(let a):
                return a.coord.latitude >= lat0 && a.coord.latitude <= lat1 && a.coord.longitude >= lng0 && a.coord.longitude <= lng1
            case .arc:
                return true
            }
        }
    }

    /// One promoted pin per band cell, the largest city in it, capped. Every
    /// other reachable city stays as a dot. The cell grid is anchored to
    /// absolute coordinates, so a pan does not move a cell or reshuffle a winner.
    private func cityLayers(_ cities: [CityPin], band: CityBand) -> (pins: [CityPin], dots: [CityPin]) {
        var winners: [String: CityPin] = [:]
        for pin in cities {
            let key = cellKey(pin.city, cell: band.cellDegrees)
            if let current = winners[key], !isMoreImportant(pin.city, than: current.city) { continue }
            winners[key] = pin
        }
        let ranked = winners.values.sorted { isMoreImportant($0.city, than: $1.city) }
        let pins = Array(ranked.prefix(band.pinCap))
        let promoted = Set(pins.map(\.id))
        return (pins, cities.filter { !promoted.contains($0.id) })
    }

    /// A cell index that is square on screen: the longitude step shrinks with
    /// the cosine of the latitude.
    private func cellKey(_ city: TravelCity, cell: Double) -> String {
        let lat = Int((city.lat / cell).rounded(.down))
        let scale = max(cos(city.lat * .pi / 180), 0.01)
        let lng = Int((city.lng * scale / cell).rounded(.down))
        return "\(lat):\(lng)"
    }

    /// Population decides what is promoted: a big cheap city outranks a small
    /// expensive resort. The cost band stays a colour, not a rank.
    private func isMoreImportant(_ city: TravelCity, than other: TravelCity) -> Bool {
        if city.population != other.population { return city.population > other.population }
        return city.name < other.name
    }

    private func pinClusters(_ visible: [MapOverlay]) -> [PostCluster] {
        let pins = visible.compactMap { overlay -> Post? in
            if case .pin(let p) = overlay { return p.post }
            return nil
        }
        return makeClusters(pins, radiusDegrees: clusterRadiusDegrees)
    }

    private func airportPins(_ visible: [MapOverlay]) -> [AirportPin] {
        visible.compactMap { overlay in
            if case .airport(let a) = overlay { return a }
            return nil
        }
    }

    private func flightArcs(_ visible: [MapOverlay]) -> [FlightArc] {
        visible.compactMap { overlay in
            if case .arc(let a) = overlay { return a }
            return nil
        }
    }

    private func rebuild() {
        let visible = visibleOverlays
        let cities = overlays.compactMap { overlay -> CityPin? in
            if case .city(let pin) = overlay { return pin }
            return nil
        }
        let layers = cityLayers(cities, band: Self.cityBands[cityBandIndex])
        derived = Derived(
            visible: visible,
            clusters: pinClusters(visible),
            pins: layers.pins,
            dots: layers.dots,
            airports: airportPins(visible)
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

    var body: some View {
        // The arcs are read straight from the overlay list, not from the memo:
        // the loading scene changes only their progress, so a memo gated on the
        // overlay identity would freeze them and then jump on the scene change.
        let arcs = flightArcs(overlays)
        let clusters = derived.clusters
        let dots = derived.dots
        let pins = derived.pins
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
                            onTap: {
                                onTap(.pin(MapPin(post: cluster.singlePost ?? cluster.posts[0], group: cluster.posts)))
                            }
                        )
                        .scaleEffect(scale)
                    } label: { EmptyView() }
                }

                ForEach(dots) { pin in
                    Annotation(coordinate: pin.coordinate, anchor: .center) {
                        CityDotView(city: pin.city, scale: scale)
                            .onTapGesture { onTap(.city(pin)) }
                    } label: { EmptyView() }
                }

                ForEach(pins) { pin in
                    Annotation(coordinate: pin.coordinate, anchor: .center) {
                        CityPinView(city: pin.city, scale: scale)
                            .onTapGesture { onTap(.city(pin)) }
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
            .onChange(of: regionKey) { _, _ in rebuild() }
            .onChange(of: cityBandIndex) { _, _ in
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { rebuild() }
            }
            .onChange(of: overlaysFingerprint) { _, _ in rebuild() }
            .onAppear {
                rebuild()
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
                    // Exact for a tilted camera: the projection is translation-
                    // equivariant in ground space, so shifting the center by the
                    // ground vector (pin − targetCoord) lands the pin on `target`
                    // even at 60° pitch. A screen-space translation would not.
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

struct PostCluster: Identifiable {
    let id: String
    let coord: CLLocationCoordinate2D
    let count: Int
    let singlePost: Post?
    let posts: [Post]
}

/// One pass over the posts into grid cells of the cluster radius. The old
/// pairwise scan was O(n²) and ran on every camera change.
private func makeClusters(_ posts: [Post], radiusDegrees: Double) -> [PostCluster] {
    guard !posts.isEmpty, radiusDegrees > 0 else { return [] }
    var buckets: [String: [Post]] = [:]
    buckets.reserveCapacity(posts.count)
    for post in posts {
        let lat = Int((post.lat / radiusDegrees).rounded(.down))
        let lng = Int((post.lng / radiusDegrees).rounded(.down))
        buckets["\(lat):\(lng)", default: []].append(post)
    }
    return buckets.values.map { group in
        let lat = group.map(\.lat).reduce(0, +) / Double(group.count)
        let lng = group.map(\.lng).reduce(0, +) / Double(group.count)
        return PostCluster(
            id: group.map(\.id).min() ?? "",
            coord: CLLocationCoordinate2D(latitude: lat, longitude: lng),
            count: group.count,
            singlePost: group.count == 1 ? group.first : nil,
            posts: group
        )
    }
}
