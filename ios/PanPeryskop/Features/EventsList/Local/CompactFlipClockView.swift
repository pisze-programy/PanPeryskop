import SwiftUI

struct CompactFlipClockView: View {
    let time: String

    private static let tileWidth: CGFloat = 18
    private static let tileHeight: CGFloat = 27
    private static let tileCornerRadius: CGFloat = 4.5
    private static let tileBackground = Color(red: 0.12, green: 0.13, blue: 0.15)

    var body: some View {
        let digits = digitStrings
        HStack(spacing: 2.5) {
            digitTile(digits[0])
            digitTile(digits[1])
            colonDots
            digitTile(digits[2])
            digitTile(digits[3])
        }
        .shadow(color: .black.opacity(0.5), radius: 3, x: 0, y: 1.5)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityTitle)
    }

    private var accessibilityTitle: String {
        time == "--:--" ? "Cały dzień" : time
    }

    private var digitStrings: [String] {
        let chars = Array(time)
        guard chars.count >= 5 else { return ["-", "-", "-", "-"] }
        return [String(chars[0]), String(chars[1]), String(chars[3]), String(chars[4])]
    }

    private var colonDots: some View {
        VStack(spacing: 4) {
            Circle()
                .fill(Color.white.opacity(0.92))
                .frame(width: 3, height: 3)
            Circle()
                .fill(Color.white.opacity(0.92))
                .frame(width: 3, height: 3)
        }
        .padding(.horizontal, 1)
    }

    private func digitTile(_ text: String) -> some View {
        let shape = RoundedRectangle(cornerRadius: Self.tileCornerRadius, style: .continuous)
        return ZStack {
            shape.fill(Self.tileBackground)
            flapShading.clipShape(shape)
            shape.stroke(Color.white.opacity(0.22), lineWidth: 0.5)
            Text(text)
                .font(.system(size: 14.5, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.white)
        }
        .frame(width: Self.tileWidth, height: Self.tileHeight)
    }

    private var flapShading: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Color.white.opacity(0.09))
            Rectangle().fill(Color.black.opacity(0.55)).frame(height: 1)
            Rectangle().fill(Color.black.opacity(0.20))
        }
    }
}
