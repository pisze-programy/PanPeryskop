import UIKit
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

}
