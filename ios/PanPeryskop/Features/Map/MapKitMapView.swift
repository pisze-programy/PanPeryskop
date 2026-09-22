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

    /// The loading scene changes only each arc's progress, so the overlay
    /// identity never moves and a memo keyed on it would freeze the arcs. They
    /// get their own key.
    private var arcsFingerprint: String {
        guard case .arc(let first) = overlays.first else { return "none" }
        return "\(first.id)|\(first.progress)"
    }

    /// The layers a render draws. Rebuilt only when the region settles or the
    /// data changes, never per animation frame.
    private struct Derived {
        var visible: [MapOverlay] = []
        var clusters: [PostCluster] = []
        var pins: [CityPin] = []
        var dots: [CityPin] = []
        var cityClusters: [CityCluster] = []
        var airports: [AirportPin] = []
    }

    /// A city layer declutters on quantized zoom bands. A band has a fixed cell
    /// size and a fixed pin cap, so which city is a pin depends on the city and
    /// the band — never on the exact camera. Panning changes nothing, and a zoom
    /// inside a band changes nothing, so pins cannot jump.
    private struct CityBand {
        let cellDegrees: Double
    }

    private static let cityBands: [CityBand] = [
        CityBand(cellDegrees: 6),
        CityBand(cellDegrees: 2),
        CityBand(cellDegrees: 0.6),
        CityBand(cellDegrees: 0.15),
    ]

    /// A cell with this many cities or more shows a count badge instead of a pin.
    private static let clusterThreshold = 4

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

    /// Cities aggregate by proximity: one pin per band cell, the largest city in
    /// it, and a count badge where a cell holds several. There is **no** global
    /// cap: a cap ranked the whole continent and left a whole region with no pin
    /// at all. The grid is anchored to absolute coordinates and the cell size is
    /// fixed per band, so a pan never reshuffles a winner.
    private func cityLayers(_ cities: [CityPin], band: CityBand) -> CityLayer {
        var buckets: [String: [CityPin]] = [:]
        for pin in cities {
            buckets[cellKey(pin.city, cell: band.cellDegrees), default: []].append(pin)
        }
        var layer = CityLayer()
        for group in buckets.values {
            let ranked = group.sorted { isMoreImportant($0.city, than: $1.city) }
            guard let lead = ranked.first else { continue }
            if ranked.count >= Self.clusterThreshold {
                layer.clusters.append(CityCluster(
                    id: "city-cluster:\(lead.id)",
                    coord: lead.coordinate,
                    count: ranked.count,
                    lead: lead.city
                ))
            } else {
                layer.pins.append(lead)
            }
            layer.dots.append(contentsOf: ranked.dropFirst())
        }
        return layer
    }

    private struct CityLayer {
        var pins: [CityPin] = []
        var dots: [CityPin] = []
        var clusters: [CityCluster] = []
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

    private func flightArcs(_ visible: [MapOverlay]) -> [FlightArc] {
        visible.compactMap { overlay in
            if case .arc(let a) = overlay { return a }
            return nil
        }
    }

    /// One pass over the overlay list builds every layer. The old shape walked
    /// the whole list once for the visible set and again for the cities, on every
    /// camera settle.
    private func rebuild() {
        let pad = clusterRadiusDegrees
        let lat0 = visibleRegion.center.latitude - visibleRegion.span.latitudeDelta / 2 - pad
        let lat1 = visibleRegion.center.latitude + visibleRegion.span.latitudeDelta / 2 + pad
        let lng0 = visibleRegion.center.longitude - visibleRegion.span.longitudeDelta / 2 - pad
        let lng1 = visibleRegion.center.longitude + visibleRegion.span.longitudeDelta / 2 + pad
        func inBox(_ lat: Double, _ lng: Double) -> Bool {
            lat >= lat0 && lat <= lat1 && lng >= lng0 && lng <= lng1
        }

        var visible: [MapOverlay] = []
        var posts: [Post] = []
        var airports: [AirportPin] = []
        var cities: [CityPin] = []
        for overlay in overlays {
            switch overlay {
            case .city(let pin):
                // Never viewport-clipped: MapKit does not draw what is off
                // screen, and clipping made a pin pop in at the edge.
                cities.append(pin)
            case .arc:
                visible.append(overlay)
            case .pin(let p):
                guard inBox(p.post.lat, p.post.lng) else { continue }
                visible.append(overlay)
                posts.append(p.post)
            case .airport(let a):
                guard inBox(a.coord.latitude, a.coord.longitude) else { continue }
                visible.append(overlay)
                airports.append(a)
            }
        }

        let layer = cityLayers(cities, band: Self.cityBands[cityBandIndex])
        arcs = flightArcs(overlays)
        derived = Derived(
            visible: visible,
            clusters: makeClusters(posts, radiusDegrees: pad),
            pins: layer.pins,
            dots: layer.dots,
            cityClusters: layer.clusters,
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

    var body: some View {
        // The arcs are read straight from the overlay list, not from the memo:
        // the loading scene changes only their progress, so a memo gated on the
        // overlay identity would freeze them and then jump on the scene change.
        let clusters = derived.clusters
        let cityClusters = derived.cityClusters
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

                ForEach(cityClusters) { cluster in
                    Annotation(coordinate: cluster.coord, anchor: .center) {
                        CityClusterView(cluster: cluster, scale: scale)
                            .onTapGesture { onTap(.city(CityPin(city: cluster.lead))) }
                    } label: { EmptyView() }
                }

                ForEach(dots) { pin in
                    Annotation(coordinate: pin.coordinate, anchor: .center) {
                        CityDotView(city: pin.city, scale: scale)
                            .equatable()
                            .onTapGesture { onTap(.city(pin)) }
                    } label: { EmptyView() }
                }

                ForEach(pins) { pin in
                    Annotation(coordinate: pin.coordinate, anchor: .center) {
                        CityPinView(city: pin.city, scale: scale)
                            .equatable()
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
            .onChange(of: arcsFingerprint) { _, _ in arcs = flightArcs(overlays) }
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
