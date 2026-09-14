import SwiftUI
import CoreLocation

struct PlaceRowView: View {
    let place: TravelPlace
    let kind: PlaceKind
    let eventCoordinate: CLLocationCoordinate2D
    let airportCoordinate: CLLocationCoordinate2D?
    let nights: Int
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                HStack(alignment: .center, spacing: Theme.Spacing.m) {
                    details
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.secondary)
                }
                gallery
            }
            .padding(Theme.Spacing.m)
            .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(place.name)
                .font(.headline.weight(.bold))
                .lineLimit(2)
            if let rating = place.rating {
                Text("★ \(String(format: "%.1f", rating)) · \(place.reviews ?? 0) opinii")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            if kind == .hotel {
                Text(place.nightlyPriceLabel)
                    .font(.subheadline.weight(.bold))
                Text(place.totalPriceLabel(nights: nights))
                    .font(.caption)
                    .foregroundColor(.secondary)
            } else {
                Text(place.priceLabel)
                    .font(.subheadline.weight(.bold))
            }
            Text(place.address)
                .font(.caption)
                .foregroundColor(.secondary)
            Text(place.distancesLabel(event: eventCoordinate, airport: airportCoordinate))
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    private var gallery: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                AsyncImage(url: URL(string: place.image)) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFill()
                    case .failure: Color(.systemGray5).overlay(Image(systemName: "photo").foregroundColor(.secondary))
                    default: Color(.systemGray5)
                    }
                }
                .containerRelativeFrame(.horizontal)
                .frame(height: 180)
            }
        }
        .frame(height: 180)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous))
    }
}

struct PlaceRowSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            SkeletonBlock(width: 160, height: 16)
            SkeletonBlock(width: 90, height: 11)
            SkeletonBlock(width: 70, height: 14)
            SkeletonBlock(width: 130, height: 10)
            SkeletonBlock(height: 180, radius: Theme.Radius.chip)
        }
        .padding(Theme.Spacing.m)
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
        .skeletonPulse()
    }
}
