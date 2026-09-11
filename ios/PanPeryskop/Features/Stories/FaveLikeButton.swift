import SwiftUI

struct FaveLikeButton: View {
    let isLiked: Bool
    let onToggle: (Bool) -> Void

    @State private var trigger = 0

    var body: some View {
        Button(action: {
            onToggle(!isLiked)
        }) {
            ZStack {
                ring
                sparks
                heart
            }
            .frame(width: 56, height: 56)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .onChange(of: isLiked) { _, newValue in
            if newValue { trigger += 1 }
        }
    }

    private var heart: some View {
        Image(systemName: isLiked ? "heart.fill" : "heart")
            .font(.system(size: 30, weight: .semibold))
            .foregroundColor(isLiked ? Color(red: 226 / 255, green: 38 / 255, blue: 77 / 255) : .white)
            .scaleEffect(isLiked ? 1.15 : 1)
            .modifier(PopScale(trigger: trigger))
    }

    private var ring: some View {
        Circle()
            .stroke(
                LinearGradient(
                    colors: [
                        Color(red: 221 / 255, green: 70 / 255, blue: 136 / 255),
                        Color(red: 205 / 255, green: 143 / 255, blue: 246 / 255),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                lineWidth: 3
            )
            .frame(width: 56, height: 56)
            .opacity(trigger > 0 ? 0 : 1)
            .scaleEffect(trigger > 0 ? 1.5 : 1)
            .animation(.easeOut(duration: 0.3), value: trigger)
    }

    private var sparks: some View {
        ZStack {
            ForEach(0..<7, id: \.self) { i in
                SparkDot(index: i, trigger: trigger)
            }
        }
    }
}

private struct PopScale: ViewModifier {
    let trigger: Int

    @State private var scale: CGFloat = 1

    func body(content: Content) -> some View {
        content
            .scaleEffect(scale)
            .onChange(of: trigger) { _, _ in
                guard trigger > 0 else { return }
                scale = 1.35
                withAnimation(.spring(response: 0.13, dampingFraction: 0.5)) {
                    scale = 0.9
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.14) {
                    withAnimation(.spring(response: 0.11, dampingFraction: 0.4)) {
                        scale = 1
                    }
                }
            }
    }
}

private struct SparkDot: View {
    let index: Int
    let trigger: Int

    private static let colors: [Color] = [
        Color(red: 152 / 255, green: 219 / 255, blue: 236 / 255),
        Color(red: 247 / 255, green: 188 / 255, blue: 48 / 255),
    ]

    private var angle: Angle {
        .degrees(Double(index) / 7.0 * 360)
    }

    private var startOffset: CGSize {
        CGSize(width: cos(angle.radians) * 22, height: sin(angle.radians) * 22)
    }

    var body: some View {
        Circle()
            .fill(Self.colors[index % Self.colors.count])
            .frame(width: 7, height: 7)
            .offset(startOffset)
            .opacity(trigger > 0 ? 0 : 1)
            .scaleEffect(trigger > 0 ? 0.4 : 1)
            .animation(.easeOut(duration: 0.45), value: trigger)
    }
}
