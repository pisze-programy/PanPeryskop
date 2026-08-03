import SwiftUI
import AVFoundation

struct PermissionGateView: View {
    @State private var cameraAuthorized = false
    @State private var micAuthorized = false
    @State private var checked = false
    @State private var checking = false

    let onReady: () -> Void
    let onCancel: () -> Void

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if checking {
                ProgressView().tint(.white).scaleEffect(1.5)
            } else if checked && (!cameraAuthorized || !micAuthorized) {
                deniedView
            } else {
                Color.black.onAppear { checkPermissions() }
            }
        }
    }

    private var deniedView: some View {
        VStack(spacing: 24) {
            Image(systemName: "camera.fill")
                .font(.system(size: 48)).foregroundColor(.white.opacity(0.6))
            Text("Uprawnienia wymagane")
                .font(.title2).fontWeight(.semibold).foregroundColor(.white)
            Text("Aplikacja potrzebuje dostępu do aparatu i mikrofonu.")
                .font(.subheadline).foregroundColor(.white.opacity(0.7))
                .multilineTextAlignment(.center).padding(.horizontal, 32)
            Button {
                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                UIApplication.shared.open(url)
            } label: {
                Label("Otwórz Ustawienia", systemImage: "gearshape.fill")
                    .font(.headline).foregroundColor(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(Color.accentColor).clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .padding(.horizontal, 32)
            Button(action: onCancel) {
                Text("Anuluj").foregroundColor(.white.opacity(0.6))
            }
        }
    }

    private func checkPermissions() {
        #if targetEnvironment(simulator)
        onReady(); return
        #endif
        checking = true
        let camStatus = AVCaptureDevice.authorizationStatus(for: .video)
        cameraAuthorized = (camStatus == .authorized)

        if camStatus == .notDetermined {
            AVCaptureDevice.requestAccess(for: .video) { granted in
                Task { @MainActor in
                    cameraAuthorized = granted
                    requestMicIfNeeded()
                }
            }
        } else {
            requestMicIfNeeded()
        }
    }

    private func requestMicIfNeeded() {
        AVAudioApplication.requestRecordPermission { granted in
            Task { @MainActor in
                micAuthorized = granted
                checking = false
                checked = true
                if cameraAuthorized, micAuthorized { onReady() }
            }
        }
    }
}
