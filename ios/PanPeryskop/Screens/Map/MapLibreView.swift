import SwiftUI
import MapLibre

struct MapLibreView: UIViewRepresentable {
    let center: CLLocationCoordinate2D
    let zoom: Double
    let heatmapCells: [GridCell]
    let onRegionChange: (Double, Double, Double, Double) -> Void
    let onTapHeatCell: (GridCell) -> Void

    func makeUIView(context: Context) -> MLNMapView {
        let mapView = MLNMapView(frame: .zero, styleURL: URL(string: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json")!)
        mapView.setCenter(center, zoomLevel: zoom, animated: false)
        mapView.delegate = context.coordinator
        mapView.showsUserLocation = false
        mapView.compassView.isHidden = true
        mapView.logoView.isHidden = true
        mapView.attributionButton.isHidden = true
        return mapView
    }

    func updateUIView(_ mapView: MLNMapView, context: Context) {
        context.coordinator.drawHeatmap(mapView, cells: heatmapCells)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onRegionChange: onRegionChange, onTapHeatCell: onTapHeatCell)
    }

    class Coordinator: NSObject, MLNMapViewDelegate {
        let onRegionChange: (Double, Double, Double, Double) -> Void
        let onTapHeatCell: (GridCell) -> Void
        private var currentHeatCells: [GridCell] = []
        private var heatLabels: [String: MLNAnnotation] = [:]

        init(onRegionChange: @escaping (Double, Double, Double, Double) -> Void,
             onTapHeatCell: @escaping (GridCell) -> Void) {
            self.onRegionChange = onRegionChange
            self.onTapHeatCell = onTapHeatCell
        }

        func mapView(_ mapView: MLNMapView, regionDidChangeAnimated animated: Bool) {
            let sw = mapView.centerCoordinate
            let span = mapView.region.span
            let swLat = sw.latitude - span.latitudeDelta
            let swLng = sw.longitude - span.longitudeDelta
            let neLat = sw.latitude + span.latitudeDelta
            let neLng = sw.longitude + span.longitudeDelta
            onRegionChange(swLat, swLng, neLat, neLng)
        }

        func mapView(_ mapView: MLNMapView, didSelect annotation: MLNAnnotation) {
            guard let gridCell = annotation as? HeatAnnotation else { return }
            onTapHeatCell(gridCell.cell)
        }

        func drawHeatmap(_ mapView: MLNMapView, cells: [GridCell]) {
            guard !cells.isEmpty else { return }

            if let shapeSource = mapView.style?.source(withIdentifier: "heatmap-source") as? MLNShapeSource {
                shapeSource.shape = geometries(for: cells, mapView: mapView)
            } else {
                let source = MLNShapeSource(identifier: "heatmap-source", shape: geometries(for: cells, mapView: mapView), options: nil)
                mapView.style?.addSource(source)

                let layer = MLNFillStyleLayer(identifier: "heatmap-layer", source: source)
                layer.fillOpacity = NSExpression(forConstantValue: 0.35)
                layer.fillColor = NSExpression(forConstantValue: UIColor.yellow)
                mapView.style?.addLayer(layer)
            }
        }

        private func geometries(for cells: [GridCell], mapView: MLNMapView) -> MLNShapeCollectionFeature {
            var features: [MLNPolygonFeature] = []
            let cellWidth = mapView.region.span.longitudeDelta * 0.1

            for cell in cells {
                let coords = [
                    CLLocationCoordinate2D(latitude: cell.lat - 0.001, longitude: cell.lng - cellWidth),
                    CLLocationCoordinate2D(latitude: cell.lat + 0.001, longitude: cell.lng - cellWidth),
                    CLLocationCoordinate2D(latitude: cell.lat + 0.001, longitude: cell.lng + cellWidth),
                    CLLocationCoordinate2D(latitude: cell.lat - 0.001, longitude: cell.lng + cellWidth),
                    CLLocationCoordinate2D(latitude: cell.lat - 0.001, longitude: cell.lng - cellWidth),
                ]
                let polygon = MLNPolygonFeature(coordinates: coords, count: UInt(coords.count))
                polygon.attributes = ["heat": cell.heat, "cell_id": cell.grid_cell_id]
                features.append(polygon)
            }

            return MLNShapeCollectionFeature(shapes: features)
        }
    }
}

class HeatAnnotation: MLNPointAnnotation {
    let cell: GridCell
    init(cell: GridCell) {
        self.cell = cell
        super.init()
        coordinate = CLLocationCoordinate2D(latitude: cell.lat, longitude: cell.lng)
    }
}
