import SwiftUI

/// Airport pin — fixed IATA text badge (no thumbUrl, unlike media pins).
/// Origin airport and every reachable destination render as `XXX`.
struct AirportPinBadge: View {
    let iata: String

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.black.opacity(0.75))
                .frame(width: 44, height: 30)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.white.opacity(0.35), lineWidth: 1))
            Text(iata)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
        }
        .shadow(color: .black.opacity(0.3), radius: 4, x: 0, y: 2)
    }
}