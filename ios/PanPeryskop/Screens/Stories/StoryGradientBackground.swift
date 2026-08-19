import SwiftUI

/// Random mesh-gradient seed — generated once per preview open and kept in
/// `@State` by the caller, so the backdrop never changes while viewing or when
/// switching stories. 2–3 cool hues in a given range, low opacity.
struct StoryGradientSeed {
    let points: [SIMD2<Float>]
    let colors: [Color]
    let background: Color

    static func random() -> StoryGradientSeed {
        // 2-3 base hues in the cool range (purple/blue/pink).
        let baseHues = (0..<Int.random(in: 2...3)).map { _ in Double.random(in: 0.5...0.9) }
        let colors: [Color] = (0..<9).map { i in
            let h = baseHues[i % baseHues.count]
            return Color(
                hue: h,
                saturation: Double.random(in: 0.6...0.85),
                brightness: Double.random(in: 0.5...0.75)
            )
            .opacity(0.82)
        }
        // 3x3 mesh: outer frame pinned to the view bounds, interior point drifts
        // slightly for variety (x and y still progress left→right / top→bottom).
        let points: [SIMD2<Float>] = [
            [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
            [0.0, 0.5], [Float.random(in: 0.3...0.7), Float.random(in: 0.3...0.7)], [1.0, 0.5],
            [0.0, 1.0], [0.5, 1.0], [1.0, 1.0],
        ]
        return StoryGradientSeed(
            points: points,
            colors: colors,
            background: Color(hue: 0.6, saturation: 0.4, brightness: 0.25)
        )
    }
}

/// Opaque full-bleed mesh gradient behind the story media (event poster / live
/// image). A solid base color keeps the preview from being see-through, while
/// the vivid low-blend mesh adds color without dominating the media.
struct StoryMeshGradient: View {
    let seed: StoryGradientSeed

    var body: some View {
        ZStack {
            Color(seed.background)
                .ignoresSafeArea()
            MeshGradient(
                width: 3,
                height: 3,
                points: seed.points,
                colors: seed.colors,
                background: seed.background
            )
            .ignoresSafeArea()
        }
        .ignoresSafeArea()
    }
}
