import SwiftUI

@MainActor
final class ToastManager: ObservableObject {
    static let shared = ToastManager()

    struct Item: Identifiable, Equatable {
        let id: String
        let message: String
    }

    @Published private(set) var items: [Item] = []
    private var hideTasks: [String: Task<Void, Never>] = [:]

    /// Auto-hiding toast. Repeated calls stack on top of the previous ones.
    func show(_ message: String, seconds: Double = 2.5) {
        let id = UUID().uuidString
        push(Item(id: id, message: message))
        hideTasks[id] = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            self?.remove(id)
        }
    }

    /// Sticky toast keyed by `key`: the same key replaces its message and it stays
    /// until `dismiss(key:)`. Used for "loading" states under a progress flow.
    func showSticky(_ message: String, key: String) {
        hideTasks[key]?.cancel()
        hideTasks[key] = nil
        if let index = items.firstIndex(where: { $0.id == key }) {
            items[index] = Item(id: key, message: message)
        } else {
            push(Item(id: key, message: message))
        }
    }

    func dismiss(key: String) {
        hideTasks[key]?.cancel()
        hideTasks[key] = nil
        remove(key)
    }

    func dismissAll() {
        hideTasks.values.forEach { $0.cancel() }
        hideTasks.removeAll()
        items.removeAll()
    }

    private func push(_ item: Item) {
        withAnimation(.easeInOut(duration: 0.3)) { items.append(item) }
    }

    private func remove(_ id: String) {
        withAnimation(.easeInOut(duration: 0.3)) { items.removeAll { $0.id == id } }
    }
}

struct ToastView: View {
    @ObservedObject private var manager = ToastManager.shared

    var body: some View {
        VStack {
            Spacer()
            VStack(spacing: 8) {
                ForEach(manager.items) { item in
                    Text(item.message)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.white)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                        .background(Color.black.opacity(0.8))
                        .clipShape(Capsule())
                }
            }
            // Above the Lokalne | Europa pill and the bottom bar.
            .padding(.bottom, 190)
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}
