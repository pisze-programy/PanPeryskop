import SwiftUI

/// The licence text for the city data and the photo.
struct CitySourcesSection: View {
    var body: some View {
        TripsSectionFooter(
            text: "Dane o mieście: Data from Nomads.com — https://nomads.com. Zdjęcie: Unsplash. Ceny są orientacyjne i mogą się zmienić u dostawcy.",
            showsPriceInfo: true
        )
        .padding(.horizontal, Theme.Spacing.l)
    }
}
