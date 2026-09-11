import SwiftUI

extension TravelEvent {
    var tagSymbol: String {
        switch tag {
        case TripsViewModel.TravelTag.runs.rawValue: return "figure.run"
        case TripsViewModel.TravelTag.football.rawValue: return "sportscourt.fill"
        case TripsViewModel.TravelTag.cityBreak.rawValue: return "building.2.fill"
        default: return "airplane"
        }
    }

    var tagColor: Color {
        switch tag {
        case TripsViewModel.TravelTag.runs.rawValue: return .green
        case TripsViewModel.TravelTag.football.rawValue: return Color.accentColor
        case TripsViewModel.TravelTag.cityBreak.rawValue: return .teal
        default: return .secondary
        }
    }
}

/// Tournament-fixture header: left team vs right team, then city/country + date · hour.
struct MatchCardView: View {
    let event: TravelEvent

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 12) {
                teamLabel(event.home)
                Text(AppConstants.matchSeparator.trimmingCharacters(in: .whitespaces))
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(.secondary)
                teamLabel(event.away)
            }
            Text("\(event.city), \(event.country) · \(dateLabel) · \(event.hour)")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 20)
        .padding(.bottom, 12)
    }

    @ViewBuilder
    private func teamLabel(_ name: String?) -> some View {
        if let name {
            Text(name)
                .font(.headline)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        } else {
            Text(event.title)
                .font(.headline)
                .frame(maxWidth: .infinity)
        }
    }

    private var dateLabel: String {
        AppConstants.fullDateFormatter.string(from: Date(timeIntervalSince1970: TimeInterval(event.start_ms) / 1000))
    }
}

/// Full-width horizontal pin rail of group events + centered page dots.
struct EventPagerRail: View {
    let events: [TravelEvent]
    @Binding var activeIndex: Int

    var body: some View {
        VStack(spacing: 6) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(Array(events.enumerated()), id: \.element.id) { index, event in
                        Button {
                            activeIndex = index
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 4) {
                                    Image(systemName: event.tagSymbol)
                                        .font(.caption2)
                                        .foregroundColor(event.tagColor)
                                    Text(event.home ?? event.city)
                                        .font(.caption.weight(.bold))
                                        .lineLimit(1)
                                }
                                Text(event.hour)
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .frame(width: 140, alignment: .leading)
                            .background(index == activeIndex ? Color.accentColor.opacity(0.2) : Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
            if events.count > 1 {
                HStack(spacing: 5) {
                    ForEach(events.indices, id: \.self) { index in
                        Circle()
                            .fill(index == activeIndex ? Color.accentColor : Color.secondary.opacity(0.4))
                            .frame(width: 6, height: 6)
                    }
                }
            }
        }
        .padding(.vertical, 8)
    }
}