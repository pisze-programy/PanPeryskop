import SwiftUI

/// Airport pin — fixed IATA text badge (no thumbUrl, unlike media pins).
/// Destination airports tint by their airline (wizzair if present, else ryanair).
struct AirportPinBadge: View {
    let iata: String
    var airlines: [Airline] = []

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(fillColor)
                .frame(width: 44, height: 30)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.white.opacity(0.35), lineWidth: 1))
            Text(iata)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
        }
        .shadow(color: .black.opacity(0.3), radius: 4, x: 0, y: 2)
    }

    private var fillColor: Color {
        if airlines.contains(.wizzair) { return Airline.wizzair.color }
        if airlines.contains(.ryanair) { return Airline.ryanair.color }
        return Color.black.opacity(0.75)
    }
}

/// Origin (selected start) airport pin — circular like a media pin, airplane icon,
/// airline border (blue = Ryanair only, half blue/pink = both), not clickable.
struct OriginAirportPin: View {
    let iata: String
    let airlines: [Airline]

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.black.opacity(0.25))
                .frame(width: 52, height: 52)
            Circle()
                .stroke(border, lineWidth: 3)
                .frame(width: 52, height: 52)
            ZStack {
                Circle().fill(Color.white.opacity(0.95))
                Image(systemName: "airplane")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.black.opacity(0.7))
            }
            .frame(width: 44, height: 44)
            .clipShape(Circle())
        }
        .overlay(alignment: .bottom) {
            Text(iata)
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 6)
                .padding(.vertical, 1)
                .background(Capsule().fill(Color.black.opacity(0.7)))
                .offset(y: -4)
        }
        .allowsHitTesting(false)
    }

    private var border: LinearGradient {
        let hasWizz = airlines.contains(.wizzair)
        let hasRyan = airlines.contains(.ryanair)
        if hasRyan && hasWizz {
            return LinearGradient(colors: [Airline.ryanair.color, Airline.wizzair.color], startPoint: .leading, endPoint: .trailing)
        }
        let color = hasWizz ? Airline.wizzair.color : (hasRyan ? Airline.ryanair.color : .gray)
        return LinearGradient(colors: [color, color], startPoint: .leading, endPoint: .trailing)
    }
}