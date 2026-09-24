import SwiftUI

struct PhotoStoryBandBackground: View {
    var tintOpacity: Double = 0.38
    var strongAtTop: Bool = false

    var body: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial).opacity(0.5)
            LinearGradient(stops: tintStops, startPoint: .top, endPoint: .bottom)
        }
        .mask(edgeFade)
    }

    private var tintStops: [Gradient.Stop] {
        if strongAtTop {
            return [
                .init(color: .black.opacity(tintOpacity), location: 0),
                .init(color: .black.opacity(tintOpacity), location: 0.55),
                .init(color: .black.opacity(0), location: 1),
            ]
        }
        return [
            .init(color: .black.opacity(0), location: 0),
            .init(color: .black.opacity(tintOpacity), location: 0.30),
            .init(color: .black.opacity(tintOpacity), location: 0.70),
            .init(color: .black.opacity(0), location: 1),
        ]
    }

    private var edgeFade: LinearGradient {
        if strongAtTop {
            return LinearGradient(
                stops: [
                    .init(color: .black, location: 0),
                    .init(color: .black, location: 0.70),
                    .init(color: .clear, location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        return LinearGradient(
            stops: [
                .init(color: .clear, location: 0),
                .init(color: .black, location: 0.14),
                .init(color: .black, location: 0.86),
                .init(color: .clear, location: 1),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }
}
