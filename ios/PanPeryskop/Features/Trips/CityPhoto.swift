import SwiftUI
import UIKit

struct CityPhoto: View {
    let city: TravelCity
    var wantsLarge = false
    var showsPlaceholder = true

    private var bundle: UIImage? { CityThumbStore.image(for: city.id) }

    var body: some View {
        Color.clear
            .overlay {
                ZStack {
                    if showsPlaceholder {
                        Rectangle()
                            .fill(CityPalette.gradient(countryCode: city.countryCode, bandRank: city.bandRank).first ?? .gray)
                    }
                    if let bundle {
                        photo(bundle)
                        if wantsLarge { RemoteImage(url: city.heroURL) }
                    } else {
                        RemoteImage(url: city.thumbURL)
                        RemoteImage(url: city.heroURL)
                    }
                }
            }
            .clipped()
    }

    private func photo(_ image: UIImage) -> some View {
        Image(uiImage: image)
            .resizable()
            .aspectRatio(contentMode: .fill)
    }
}
