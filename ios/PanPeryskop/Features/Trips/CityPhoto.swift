import SwiftUI
import UIKit

struct CityPhoto: View {
    let city: TravelCity
    var networkURL: URL? = nil
    var showsPlaceholder = true

    @State private var bundleImage: UIImage?
    @State private var loadedCityID: String?
    @State private var bundleMissing = false

    private var displayedBundle: UIImage? {
        if loadedCityID == city.id { return bundleImage }
        return CityThumbStore.cached(city.id)
    }

    private var isBundleMissing: Bool {
        if loadedCityID == city.id, bundleMissing { return true }
        return CityThumbStore.isMissing(city.id)
    }

    private var remoteURL: URL? {
        if let networkURL { return networkURL }
        guard displayedBundle == nil, isBundleMissing else { return nil }
        return city.thumbURL
    }

    var body: some View {
        Color.clear
            .overlay { layers }
            .clipped()
            .task(id: city.id) { await loadBundle() }
    }

    private var layers: some View {
        ZStack {
            if showsPlaceholder {
                placeholder
            }
            if let image = displayedBundle {
                photo(image)
            }
            if let remoteURL {
                RemoteImage(url: remoteURL)
            }
        }
    }

    private var placeholder: some View {
        Rectangle()
            .fill(CityPalette.gradient(countryCode: city.countryCode, bandRank: city.bandRank).first ?? .gray)
    }

    private func photo(_ image: UIImage) -> some View {
        Image(uiImage: image)
            .resizable()
            .aspectRatio(contentMode: .fill)
    }

    private func loadBundle() async {
        if let hit = CityThumbStore.cached(city.id) {
            applyBundle(hit, for: city.id)
            return
        }
        if CityThumbStore.isMissing(city.id) {
            applyMissing(for: city.id)
            return
        }
        resetState()
        let loaded = await CityThumbStore.load(city.id)
        guard !Task.isCancelled else { return }
        applyResult(loaded, for: city.id)
    }

    private func resetState() {
        loadedCityID = nil
        bundleImage = nil
        bundleMissing = false
    }

    private func applyBundle(_ image: UIImage, for id: String) {
        loadedCityID = id
        bundleImage = image
        bundleMissing = false
    }

    private func applyMissing(for id: String) {
        loadedCityID = id
        bundleImage = nil
        bundleMissing = true
    }

    private func applyResult(_ image: UIImage?, for id: String) {
        guard let image else {
            applyMissing(for: id)
            return
        }
        applyBundle(image, for: id)
    }
}
