import SwiftUI

/// Horizontal day tabs for the bus search. The event day carries a border and
/// the event icon; the strip opens scrolled to it.
struct BusDayStrip: View {
    let days: [Date]
    let selected: Date
    let eventDay: Date
    let eventIcon: String
    let scrollAnchor: UnitPoint
    let onSelect: (Date) -> Void

    private static let calendar = AppConstants.warsawCalendar

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Theme.Spacing.s) {
                    ForEach(days, id: \.self) { day in
                        tab(day).id(day)
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
            }
            .onAppear { proxy.scrollTo(selected, anchor: scrollAnchor) }
        }
    }

    private func tab(_ day: Date) -> some View {
        let isSelected = Self.calendar.isDate(day, inSameDayAs: selected)
        let isEventDay = Self.calendar.isDate(day, inSameDayAs: eventDay)
        return Button {
            Haptics.selection()
            onSelect(day)
        } label: {
            VStack(spacing: 2) {
                if isEventDay {
                    Image(systemName: eventIcon)
                        .font(.caption2)
                        .foregroundColor(Theme.Palette.partnerGreen)
                }
                Text(AppConstants.weekdayFormatter.string(from: day))
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(isSelected ? .primary : .secondary)
                Text(AppConstants.shortDayFormatter.string(from: day))
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(isSelected ? .primary : .secondary)
            }
            .frame(minWidth: 56)
            .padding(.vertical, Theme.Spacing.s)
            .padding(.horizontal, Theme.Spacing.s)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous)
                    .fill(isSelected ? Theme.Palette.surface : .clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous)
                    .stroke(Theme.Palette.partnerGreen, lineWidth: isSelected ? 1.5 : 0)
            )
        }
        .buttonStyle(.plain)
    }
}
