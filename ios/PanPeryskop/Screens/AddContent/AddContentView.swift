import SwiftUI
import AVFoundation

struct AddContentView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var captureResult: MediaResult?
    @State private var showPermissionGate = false
    @State private var showPicker = false

    var body: some View {
        NavigationStack {
            Group {
                if showPermissionGate {
                    PermissionGateView(
                        onReady: { showPermissionGate = false },
                        onCancel: { dismiss() }
                    )
                } else if let result = captureResult {
                    descriptionStep(for: result)
                } else if showPicker {
                    MediaCaptureView { result in
                        switch result {
                        case .cancelled:
                            dismiss()
                        case .photo, .video:
                            captureResult = result
                            ToastManager.shared.show("Gotowe!")
                        }
                    }
                    .ignoresSafeArea()
                } else {
                    loadingView
                }
            }
        }
        .onAppear {
            precheckPermissions()
            showPicker = true
        }
    }

    private var loadingView: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 16) {
                ProgressView()
                    .tint(.white)
                    .scaleEffect(1.4)
                Text("Włączanie aparatu…")
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.7))
            }
        }
    }

    private func precheckPermissions() {
        #if targetEnvironment(simulator)
        return
        #else
        let camStatus = AVCaptureDevice.authorizationStatus(for: .video)
        if camStatus == .denied || camStatus == .restricted {
            showPermissionGate = true
        }
        #endif
    }

    @ViewBuilder
    private func descriptionStep(for result: MediaResult) -> some View {
        switch result {
        case .photo(let data, let fromCamera):
            DescriptionStepView(mediaType: .photo, mediaData: data, fromCamera: fromCamera)
        case .video(let url, let fromCamera, let thumbData):
            DescriptionStepView(mediaType: .video, mediaData: thumbData, fromCamera: fromCamera, videoURL: url)
        case .cancelled:
            EmptyView()
        }
    }
}
