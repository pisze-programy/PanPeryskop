import UIKit

/// City pin images ship in the bundle: no request, no decode per frame. The
/// cache holds the decoded image, so a recycled annotation view is a set.
@MainActor
enum CityThumbStore {
    private static let cache = NSCache<NSString, UIImage>()

    static func image(for id: String) -> UIImage? {
        if let hit = cache.object(forKey: id as NSString) { return hit }
        guard let url = Bundle.main.url(forResource: "CityThumbs/\(id)", withExtension: "webp"),
              let image = UIImage(contentsOfFile: url.path) else { return nil }
        cache.setObject(image, forKey: id as NSString)
        return image
    }

    static func preload(_ ids: [String]) {
        for id in ids where cache.object(forKey: id as NSString) == nil {
            _ = image(for: id)
        }
    }
}
