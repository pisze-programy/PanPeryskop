import SwiftUI

struct PartnerLogo: View {
    let name: String
    var size: CGFloat = 40

    private var url: URL? {
        URL(string: "\(APIClient.baseURL)/media/partners/\(name).png")
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

    private func mark(_ phase: AsyncImagePhase) -> some View {
        (phase.image ?? Image(name))
            .resizable()
            .scaledToFit()
            .padding(5)
    }
}
