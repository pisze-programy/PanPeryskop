import SwiftUI

struct FlightTimelineSkeleton: View {
    var cells: Int = 7

    private static let lineSpacing: CGFloat = 4
    private static let firstLineWidth: CGFloat = 24
    private static let firstLineHeight: CGFloat = 8
    private static let secondLineWidth: CGFloat = 34
    private static let secondLineHeight: CGFloat = 7
    private static let thirdLineWidth: CGFloat = 28
    private static let thirdLineHeight: CGFloat = 8
    private static let fourthLineWidth: CGFloat = 30
    private static let fourthLineHeight: CGFloat = 8

    var body: some View {
        HStack(spacing: FlightTimeline.cellSpacing) {
            ForEach(0..<cells, id: \.self) { _ in
                cell
            }
        }
        .padding(.horizontal, Theme.Spacing.xs)
        .padding(.vertical, Theme.Spacing.xs)
        .skeletonPulse()
        .allowsHitTesting(false)
    }

    private var cell: some View {
        VStack(spacing: Self.lineSpacing) {
            SkeletonBlock(width: Self.firstLineWidth, height: Self.firstLineHeight)
            SkeletonBlock(width: Self.secondLineWidth, height: Self.secondLineHeight)
            SkeletonBlock(width: Self.thirdLineWidth, height: Self.thirdLineHeight)
            SkeletonBlock(width: Self.fourthLineWidth, height: Self.fourthLineHeight)
        }
        .frame(width: FlightTimeline.cellWidth, height: FlightTimeline.cellHeight)
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.chip))
    }
}
