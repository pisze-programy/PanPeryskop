import SwiftUI

struct CityHotelSection: View {
    let city: TravelCity

    private static let chartHeight: CGFloat = 150
    private static let barSpacing: CGFloat = 4
    private static let monthNames = ["Sty", "Lut", "Mar", "Kwi", "Maj", "Cze", "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru"]

    private var months: [CitySeasonMonth] { city.seasonMonths.sorted { $0.month < $1.month } }

    var body: some View {
        if !months.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                header
                chart
            }
            .padding(.top, Theme.Spacing.section)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Divider()
            HStack(spacing: Theme.Spacing.s) {
                Text("Sezonowość".uppercased())
                    .font(Theme.Typo.sectionLabel)
                    .kerning(0.6)
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
                Text("ruch turystyczny i pogoda")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
    }

    private var chart: some View {
        GeometryReader { geo in
            let perBar = barWidth(in: geo.size.width)
            VStack(spacing: 6) {
                ZStack(alignment: .bottomLeading) {
                    HStack(alignment: .bottom, spacing: Self.barSpacing) {
                        ForEach(months) { month in
                            bar(month)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: Self.chartHeight, alignment: .bottom)

                    tempLine(perBar: perBar)
                        .frame(height: Self.chartHeight, alignment: .bottom)
                }
                monthRow(perBar: perBar)
            }
        }
        .frame(height: Self.chartHeight + 44)
        .padding(.horizontal, Theme.Spacing.l)
    }

    private func barWidth(in total: CGFloat) -> CGFloat {
        let gaps = CGFloat(max(0, months.count - 1)) * Self.barSpacing
        return max(1, (total - gaps) / CGFloat(max(1, months.count)))
    }

    private func bar(_ month: CitySeasonMonth) -> some View {
        RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(barColor(month))
            .frame(maxWidth: .infinity)
            .frame(height: barHeight(month))
    }

    private var maxIndex: Double { months.map(\.index).max() ?? 1 }

    private func barHeight(_ month: CitySeasonMonth) -> CGFloat {
        let ratio = maxIndex > 0 ? month.index / maxIndex : 0
        return max(6, CGFloat(ratio) * Self.chartHeight)
    }

    private func barColor(_ month: CitySeasonMonth) -> Color {
        let ratio = maxIndex > 0 ? min(1, max(0, month.index / maxIndex)) : 0
        return Color(hue: (1 - ratio) * 0.33, saturation: 0.55, brightness: 0.82)
    }

    private func tempLine(perBar: CGFloat) -> some View {
        let temps = months.map(\.tempC)
        let minT = temps.min() ?? 0
        let maxT = temps.max() ?? 1
        let span = max(0.001, maxT - minT)
        var path = Path()
        for (index, month) in months.enumerated() {
            let x = perBar / 2 + CGFloat(index) * (perBar + Self.barSpacing)
            let y = (1 - CGFloat((month.tempC - minT) / span)) * Self.chartHeight
            if index == 0 {
                path.move(to: CGPoint(x: x, y: y))
            } else {
                path.addLine(to: CGPoint(x: x, y: y))
            }
        }
        return path.stroke(Color.orange.opacity(0.9), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
    }

    private func monthRow(perBar: CGFloat) -> some View {
        HStack(alignment: .top, spacing: Self.barSpacing) {
            ForEach(months) { month in
                VStack(spacing: 1) {
                    Image(systemName: weatherSymbol(month.weather))
                        .font(.system(size: 11))
                        .foregroundColor(weatherColor(month.weather))
                    Text(Self.monthNames[max(0, min(11, month.month - 1))])
                        .font(.system(size: 9, weight: .semibold))
                    Text("\(Int(month.tempC.rounded()))°")
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                }
                .frame(width: perBar)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func weatherSymbol(_ code: Int) -> String {
        switch code {
        case 0: return "sun.max.fill"
        case 2: return "cloud.rain.fill"
        case 3: return "snowflake"
        default: return "cloud.sun.fill"
        }
    }

    private func weatherColor(_ code: Int) -> Color {
        switch code {
        case 0: return .orange
        case 2: return .blue
        case 3: return .cyan
        default: return .secondary
        }
    }
}

enum HotelSegment: String, CaseIterable, Identifiable {
    case economy
    case recommended
    case luxury

    var id: String { rawValue }

    var label: String {
        switch self {
        case .economy: return "Ekonomiczne"
        case .recommended: return "Polecane"
        case .luxury: return "Premium"
        }
    }

    var minStars: Int? {
        switch self {
        case .economy: return nil
        case .recommended: return 3
        case .luxury: return 4
        }
    }

    var minGuest: Int? {
        switch self {
        case .economy: return nil
        case .recommended: return nil
        case .luxury: return 80
        }
    }
}
