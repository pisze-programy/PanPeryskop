import Foundation

struct GridCell: Codable, Identifiable {
    let grid_cell_id: String
    let lat: Double
    let lng: Double
    let heat: Int

    var id: String { grid_cell_id }
}
