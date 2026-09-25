import SwiftUI

extension View {
    func partnerCardBackground(stops: [Gradient.Stop]) -> some View {
        background(LinearGradient(stops: stops, startPoint: .leading, endPoint: .trailing))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
            .overlay(cardBorder)
    }

    private var cardBorder: some View {
        RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
            .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5)
    }
}
