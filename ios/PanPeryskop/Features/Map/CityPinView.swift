import SwiftUI

/// City-break destination pin, in the same circular shape as an event pin. A
/// thumb image replaces the icon later.
struct CityPinView: View {
    let city: TravelCity
    let isExpanded: Bool
    var scale: CGFloat = 1

    private static let dotDiameter: CGFloat = 9
    private static let ringDiameter: CGFloat = 52
    private static let iconDiameter: CGFloat = 44

    private var accent: Color { Color(hex: 0x4F46E5) }

    var body: some View {
        ZStack {
            dot
                .opacity(isExpanded ? 0 : 1)
                .scaleEffect(isExpanded ? 2.2 : 1)
            pin
                .opacity(isExpanded ? 1 : 0)
                .scaleEffect((isExpanded ? 1 : 0.35) * scale)
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.78), value: isExpanded)
        .contentShape(Rectangle())
    }

    private var dot: some View {
        Circle()
            .fill(accent)
            .frame(width: Self.dotDiameter, height: Self.dotDiameter)
            .overlay(Circle().stroke(.white, lineWidth: 1.5))
            .shadow(color: .black.opacity(0.25), radius: 1, y: 1)
    }

    private var pin: some View {
        ZStack {
            Circle().fill(Color.black.opacity(0.25))
            Circle().stroke(accent, lineWidth: 3)
            icon
        }
        .frame(width: Self.ringDiameter, height: Self.ringDiameter)
    }

    private var icon: some View {
        ZStack {
            Circle().fill(accent)
            Image(systemName: "building.2.fill")
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(.white)
        }
        .frame(width: Self.iconDiameter, height: Self.iconDiameter)
        .clipShape(Circle())
    }
}
