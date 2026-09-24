import SwiftUI
struct CityPinView: View, Equatable {
    let city: TravelCity
    var scale: CGFloat = 1

    private static let ringDiameter: CGFloat = 52
    private static let iconDiameter: CGFloat = 44

    private var accent: Color { CityPalette.base(countryCode: city.countryCode) }

    var body: some View {
        ZStack {
            Circle().fill(Color.black.opacity(0.25))
            Circle().stroke(accent, lineWidth: 3)
            photo
        }
        .frame(width: Self.ringDiameter, height: Self.ringDiameter)
        .scaleEffect(scale)
    }

    private var photo: some View {
        ZStack {
            Circle().fill(accent)
            glyph
            CityPhoto(city: city, showsPlaceholder: false)
        }
        .frame(width: Self.iconDiameter, height: Self.iconDiameter)
        .clipShape(Circle())
    }

    private var glyph: some View {
        Image(systemName: "building.2.fill")
            .font(.system(size: 18, weight: .bold))
            .foregroundColor(.white)
    }
}
