import SwiftUI
import AVFoundation
import UIKit
import Photos

struct CameraCaptureView: UIViewControllerRepresentable {
    let onCapture: (Data, UTType) -> Void

    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.mediaTypes = ["public.image", "public.movie"]
        picker.videoMaximumDuration = 60
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onCapture: onCapture)
    }

    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onCapture: (Data, UTType) -> Void

        init(onCapture: @escaping (Data, UTType) -> Void) {
            self.onCapture = onCapture
        }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage,
               let data = image.jpegData(compressionQuality: 0.9) {
                UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
                picker.dismiss(animated: true) { [weak self] in
                    self?.onCapture(data, .jpeg)
                }
                return
            }

            if let videoURL = info[.mediaURL] as? URL,
               let data = try? Data(contentsOf: videoURL) {
                UISaveVideoAtPathToSavedPhotosAlbum(videoURL.path, nil, nil, nil)
                picker.dismiss(animated: true) { [weak self] in
                    self?.onCapture(data, .mpeg4Movie)
                }
                return
            }

            picker.dismiss(animated: true)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            picker.dismiss(animated: true)
        }
    }
}
