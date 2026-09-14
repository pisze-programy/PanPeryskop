import SwiftUI
import CoreLocation

struct PlaceCard: View {
    let place: TravelPlace
    let eventCoordinate: CLLocationCoordinate2D
    let airportCoordinate: CLLocationCoordinate2D?
    var nights: Int = 1
    var width: CGFloat? = 200
    var onTap: (() -> Void)? = nil

    var body: some View {
        Button {
            onTap?()
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                image
                Text(place.name)
                    .font(.subheadline.weight(.bold))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if let rating = place.rating {
                    Text("★ \(String(format: "%.1f", rating)) · \(place.reviews ?? 0) opinii")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                if place.kind == .hotel {
                    Text(place.nightlyPriceLabel)
                        .font(.subheadline.weight(.bold))
                    Text(place.totalPriceLabel(nights: nights))
                        .font(.caption2)
                        .foregroundColor(.secondary)
                } else {
                    Text(place.priceLabel)
                        .font(.subheadline.weight(.bold))
                }
                Text(place.address)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                Text(place.distancesLabel(event: eventCoordinate, airport: airportCoordinate))
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(width: width, alignment: .leading)
        }
        .buttonStyle(.plain)
    }

    private var image: some View {
        AsyncImage(url: URL(string: place.image)) { phase in
            switch phase {
            case .success(let img): img.resizable().scaledToFill()
            case .failure: Color(.systemGray5).overlay(Image(systemName: "photo").foregroundColor(.secondary))
            default: Color(.systemGray5)
            }
        }
        .frame(height: 92)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous))
    }
}

struct PlaceSkeletonCard: View {
    var width: CGFloat = 200

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SkeletonBlock(height: 92, radius: Theme.Radius.chip)
            SkeletonBlock(width: 140, height: 14)
            SkeletonBlock(width: 90, height: 10)
            SkeletonBlock(width: 70, height: 14)
            SkeletonBlock(width: 120, height: 9)
            SkeletonBlock(width: 160, height: 9)
        }
        .frame(width: width, alignment: .leading)
        .skeletonPulse()
    }
}
