import SwiftUI
import AVFoundation

struct AddContentView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var captureResult: MediaResult?
    @State private var showPermissionGate = false

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
                } else {
                    MediaCaptureView { result in
                        switch result {
                        case .cancelled:
                            dismiss()
                        case .photo, .video:
                            captureResult = result
                        }
                    }
                    .ignoresSafeArea()
                }
            }
        }
        .onAppear { precheckPermissions() }
    }

    private func precheckPermissions() {
        #if targetEnvironment(simulator)
        return
        #endif
        let camStatus = AVCaptureDevice.authorizationStatus(for: .video)
        if camStatus == .denied || camStatus == .restricted {
            showPermissionGate = true
        }
    }

    @ViewBuilder
    private func descriptionStep(for result: MediaResult) -> some View {
        switch result {
        case .photo(let data, let fromCamera):
            DescriptionStepView(mediaType: .photo, mediaData: data, fromCamera: fromCamera)
        case .video(let data, let fromCamera, _):
            DescriptionStepView(mediaType: .video, mediaData: data, fromCamera: fromCamera)
        case .cancelled:
            EmptyView()
        }
    }
}
