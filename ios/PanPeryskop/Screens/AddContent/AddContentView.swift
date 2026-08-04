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
            // Let the sheet animation finish before building the camera
            // (YPImagePicker construction + AVCaptureSession is heavy).
            Task {
                try? await Task.sleep(nanoseconds: 450_000_000)
                guard !Task.isCancelled else { return }
                showPicker = true
            }
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
        case .video(let data, let fromCamera, _):
            DescriptionStepView(mediaType: .video, mediaData: data, fromCamera: fromCamera)
        case .cancelled:
            EmptyView()
        }
    }
}
