import SwiftUI
import UIKit
import YPImagePicker

struct MediaCaptureView: UIViewControllerRepresentable {
    var onFinish: (MediaResult) -> Void

    func makeUIViewController(context: Context) -> UIViewController {
        var config = YPImagePickerConfiguration()

        config.onlySquareImagesFromCamera = false
        config.shouldSaveNewPicturesToAlbum = false
        config.showsPhotoFilters = false
        config.showsVideoTrimmer = false
        config.screens = [.photo, .video]
        config.startOnScreen = .photo
        config.albumName = "Pan Peryskop"
        config.hidesStatusBar = true
        config.hidesCancelButton = false
        config.maxCameraZoomFactor = 3
        config.isScrollToChangeModesEnabled = true
        config.hidesBottomBar = false
        config.usesFrontCamera = false

        config.video.recordingTimeLimit = 60
        config.video.minimumTimeLimit = 3
        config.library.maxNumberOfItems = 1
        config.library.mediaType = .photoAndVideo

        config.colors.photoVideoScreenBackgroundColor = .black
        config.colors.safeAreaBackgroundColor = .black
        config.colors.bottomMenuItemBackgroundColor = .clear
        config.colors.bottomMenuItemSelectedTextColor = .white
        config.colors.bottomMenuItemUnselectedTextColor = UIColor.white.withAlphaComponent(0.45)
        config.colors.libraryScreenBackgroundColor = .black
        config.colors.tintColor = .systemBlue

        config.fonts.menuItemFont = .systemFont(ofSize: 15, weight: .medium)
        config.fonts.cameraTimeElapsedFont = .boldSystemFont(ofSize: 14)

        config.icons.captureVideoImage = VideoCaptureIcons.ready
        config.icons.captureVideoOnImage = VideoCaptureIcons.recording

        config.wordings.cameraTitle = "Aparat"
        config.wordings.next = "Dalej"
        config.wordings.cameraTitle = "Zdjęcie"
        config.wordings.videoTitle = "Wideo"
        config.wordings.libraryTitle = "Galeria"
        config.wordings.cancel = "Anuluj"

        let picker = YPImagePicker(configuration: config)
        picker.didFinishPicking { [picker] items, cancelled in
            if cancelled {
                picker.dismiss(animated: true) { onFinish(.cancelled) }
                return
            }
            if let photo = items.singlePhoto {
                let data = photo.image.jpegData(compressionQuality: 0.9) ?? Data()
                picker.dismiss(animated: true) {
                    onFinish(.photo(data: data, fromCamera: photo.fromCamera))
                }
            } else if let video = items.singleVideo {
                let data = (try? Data(contentsOf: video.url)) ?? Data()
                let thumb = video.thumbnail.jpegData(compressionQuality: 0.8) ?? Data()
                picker.dismiss(animated: true) {
                    onFinish(.video(data: data, fromCamera: video.fromCamera, thumbData: thumb))
                }
            } else {
                picker.dismiss(animated: true) { onFinish(.cancelled) }
            }
        }

        return picker
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}

enum MediaResult {
    case photo(data: Data, fromCamera: Bool)
    case video(data: Data, fromCamera: Bool, thumbData: Data)
    case cancelled
}

enum VideoCaptureIcons {
    static let size: CGFloat = 84

    static var ready: UIImage {
        render { ctx, rect in
            let ring = UIBezierPath(ovalIn: rect.insetBy(dx: 3, dy: 3))
            ring.lineWidth = 4
            UIColor.white.setStroke()
            ring.stroke()

            let fill = UIBezierPath(ovalIn: rect.insetBy(dx: 9, dy: 9))
            UIColor.systemRed.setFill()
            fill.fill()
        }
    }

    static var recording: UIImage {
        render { ctx, rect in
            let ring = UIBezierPath(ovalIn: rect.insetBy(dx: 3, dy: 3))
            ring.lineWidth = 4
            UIColor.white.setStroke()
            ring.stroke()

            let square = UIBezierPath(
                roundedRect: CGRect(x: rect.midX - 18, y: rect.midY - 18, width: 36, height: 36),
                cornerRadius: 6
            )
            UIColor.systemRed.setFill()
            square.fill()
        }
    }

    private static func render(_ draw: (UIGraphicsImageRendererContext, CGRect) -> Void) -> UIImage {
        let renderer = UIGraphicsImageRenderer(
            size: CGSize(width: size, height: size),
            format: .init()
        )
        return renderer.image { ctx in
            draw(ctx, CGRect(x: 0, y: 0, width: size, height: size))
        }
    }
}
