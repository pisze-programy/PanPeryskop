import SwiftUI

/// City photos at the top of the city-break sheet. One to three photos lay out as
/// a bento block; more than three scroll horizontally at 70 % of the width. They
/// are not zoomable.
struct CityHeroView: View {
    let photos: [URL]

    private static let tileHeight: CGFloat = 200
    private static let stripWidthFraction: CGFloat = 0.7
    private static let tileSpacing: CGFloat = 8

    var body: some View {
        if photos.isEmpty {
            tile(height: Self.tileHeight)
                .padding(.horizontal, Theme.Spacing.l)
        } else if photos.count <= 3 {
            bento
        } else {
            strip
        }
    }

    private var bento: some View {
        HStack(spacing: Self.tileSpacing) {
            tile(photos[0], height: Self.tileHeight)
            if photos.count > 1 {
                VStack(spacing: Self.tileSpacing) {
                    tile(photos[1], height: (Self.tileHeight - Self.tileSpacing) / 2)
                    if photos.count > 2 {
                        tile(photos[2], height: (Self.tileHeight - Self.tileSpacing) / 2)
                    }
                }
            }
        }
        .frame(height: Self.tileHeight)
        .padding(.horizontal, Theme.Spacing.l)
    }

    private var strip: some View {
        GeometryReader { geo in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Self.tileSpacing) {
                    ForEach(Array(photos.enumerated()), id: \.offset) { _, photo in
                        tile(photo, height: Self.tileHeight)
                            .frame(width: geo.size.width * Self.stripWidthFraction)
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
            }
        }
        .frame(height: Self.tileHeight)
    }

    @ViewBuilder
    private func tile(_ photo: URL, height: CGFloat) -> some View {
        AsyncImage(url: photo) { image in
            image.resizable().aspectRatio(contentMode: .fill)
        } placeholder: {
            placeholder
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                .stroke(Theme.Palette.hairline, lineWidth: 0.5)
        )
    }

    private func tile(height: CGFloat) -> some View {
        placeholder
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                    .stroke(Theme.Palette.hairline, lineWidth: 0.5)
            )
    }

    private var placeholder: some View {
        ZStack {
            Theme.Palette.surface
            Image(systemName: "photo")
                .font(.title2)
                .foregroundColor(.secondary)
        }
    }
}
