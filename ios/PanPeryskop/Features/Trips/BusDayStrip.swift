import SwiftUI

/// Horizontal day tabs for the bus search. The event day is the last entry
/// (the latest you can leave and still arrive); the strip opens scrolled to it.
struct BusDayStrip: View {
    let days: [Date]
    let selected: Date
    let onSelect: (Date) -> Void

    private static let calendar = AppConstants.warsawCalendar

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    ForEach(days, id: \.self) { day in
                        tab(day)
                            .id(day)
                    }
                }
                .padding(.horizontal, Theme.Spacing.s)
            }
            .onAppear {
                proxy.scrollTo(selected, anchor: .trailing)
            }
        }
    }

    private func tab(_ day: Date) -> some View {
        let isSelected = Self.calendar.isDate(day, inSameDayAs: selected)
        return Button {
            Haptics.selection()
            onSelect(day)
        } label: {
            VStack(spacing: 2) {
                Text(AppConstants.weekdayFormatter.string(from: day))
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(isSelected ? .primary : .secondary)
                Text(AppConstants.shortDayFormatter.string(from: day))
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(isSelected ? .primary : .secondary)
            }
            .frame(minWidth: 64)
            .padding(.vertical, Theme.Spacing.s)
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(isSelected ? Theme.Palette.partnerGreen : Color.clear)
                    .frame(height: 2)
            }
        }
        .buttonStyle(.plain)
    }
}
