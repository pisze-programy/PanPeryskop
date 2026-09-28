import SwiftUI

struct FilterButton: View {
    let label: String
    var isActive = false
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.selection()
            action()
        } label: {
            FilterLabel(label: label, isActive: isActive)
        }
        .buttonStyle(.plain)
    }
}

struct FilterMenu<Content: View>: View {
    private let label: String
    private let isActive: Bool
    private let content: Content

    init(label: String, isActive: Bool = false, @ViewBuilder content: () -> Content) {
        self.label = label
        self.isActive = isActive
        self.content = content()
    }

    var body: some View {
        Menu { content } label: {
            FilterLabel(label: label, isActive: isActive)
        }
    }
}

private struct FilterLabel: View {
    let label: String
    let isActive: Bool

    var body: some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.subheadline.weight(.semibold))
            Image(systemName: "chevron.down")
                .font(.caption2.weight(.semibold))
        }
        .foregroundColor(isActive ? .accentColor : .primary)
    }
}
