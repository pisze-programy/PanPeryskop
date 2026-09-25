import SwiftUI

struct PartnerLogo: View {
    let name: String
    var size: CGFloat = 40

    private var url: URL? {
        URL(string: "\(APIClient.baseURL)/media/partners/\(name).png")
    }

    private var bundled: Image? {
        UIImage(named: name).map(Image.init)
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(Color.white)
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5)
            AsyncImage(url: url, content: mark)
        }
        .frame(width: size, height: size)
    }

    @ViewBuilder
    private func mark(_ phase: AsyncImagePhase) -> some View {
        if let image = phase.image ?? bundled {
            image
                .resizable()
                .scaledToFit()
                .padding(5)
        } else {
            Text(String(name.prefix(1)).uppercased())
                .font(.system(size: size * 0.4, weight: .bold))
                .foregroundColor(Color.black.opacity(0.7))
        }
    }
}
