import SwiftUI

@MainActor
class ToastManager: ObservableObject {
    static let shared = ToastManager()
    @Published var message: String?
    @Published var isVisible = false

    private var hideTask: Task<Void, Never>?

    func show(_ msg: String) {
        hideTask?.cancel()
        message = msg
        withAnimation(.easeInOut(duration: 0.3)) { isVisible = true }
        hideTask = Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            withAnimation(.easeInOut(duration: 0.3)) { isVisible = false }
        }
    }
}

struct ToastView: View {
    @ObservedObject private var manager = ToastManager.shared

    var body: some View {
        if manager.isVisible, let msg = manager.message {
            VStack {
                Spacer()
                Text(msg)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(Color.black.opacity(0.8))
                    .clipShape(Capsule())
                    .padding(.bottom, 120)
            }
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}
