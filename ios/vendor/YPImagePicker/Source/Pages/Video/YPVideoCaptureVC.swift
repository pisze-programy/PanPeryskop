//
//  YPVideoVC.swift
//  YPImgePicker
//
//  Created by Sacha Durand Saint Omer on 27/10/16.
//  Copyright © 2016 Yummypets. All rights reserved.
//

import UIKit

internal class YPVideoCaptureVC: UIViewController, YPPermissionCheckable {
    var didCaptureVideo: ((URL) -> Void)?
    var onModeSwitch: (() -> Void)?
    var onOpenLibrary: (() -> Void)?
    
    private let videoHelper = YPVideoCaptureHelper()
    private let v = YPCameraView(overlayView: nil)
    private var viewState = ViewState()
    private var hasPlayedCardAnimation = false
    
    // MARK: - Init
    
    required init?(coder aDecoder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    
    required init() {
        super.init(nibName: nil, bundle: nil)
        title = YPConfig.wordings.videoTitle
        videoHelper.didCaptureVideo = { [weak self] videoURL in
            self?.didCaptureVideo?(videoURL)
            self?.resetVisualState()
        }
        videoHelper.videoRecordingProgress = { [weak self] progress, timeElapsed in
            self?.updateState {
                $0.progress = progress
                $0.timeElapsed = timeElapsed
            }
        }
    }
    
    // MARK: - View LifeCycle
    
    override func loadView() { view = v }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        v.timeElapsedLabel.isHidden = false // Show the time elapsed label since we're in the video screen.
        setupButtons()
        linkButtons()

        v.modeSelector.setSelected(1)
        v.modeSelector.onSelect = { [weak self] _ in self?.onModeSwitch?() }
        v.onOpenLibrary = { [weak self] in
            self?.libraryTapped()
        }
        
        // Focus
        let tapRecognizer = UITapGestureRecognizer(target: self, action: #selector(focusTapped(_:)))
        v.previewViewContainer.addGestureRecognizer(tapRecognizer)
        
        // Zoom
        let pinchRecongizer = UIPinchGestureRecognizer(target: self, action: #selector(self.pinch(_:)))
        v.previewViewContainer.addGestureRecognizer(pinchRecongizer)
    }

    func start() {
        v.loadingIndicator.startAnimating()
        v.modeSelector.setSelected(1)
        if !hasPlayedCardAnimation {
            hasPlayedCardAnimation = true
            v.playAppearAnimation()
        }
        self.videoHelper.start(previewView: v.previewViewContainer,
                               withVideoRecordingLimit: YPConfig.video.recordingTimeLimit) { [weak self] in
            DispatchQueue.main.async {
                self?.v.loadingIndicator.stopAnimating()
                self?.refreshState()
                YPHaptics.explosion()
            }
        }
    }
    
    func refreshState() {
        // Init view state with video helper's state
        updateState {
            $0.isRecording = self.videoHelper.isRecording
        }
    }
    
    // MARK: - Setup
    
    private func setupButtons() {
        v.flipButton.setImage(YPConfig.icons.loopIcon, for: .normal)
        v.shotButton.setImage(YPConfig.icons.captureVideoImage, for: .normal)
    }
    
    private func linkButtons() {
        v.shotButton.addTarget(self, action: #selector(shotButtonTapped), for: .touchUpInside)
        v.flipButton.addTarget(self, action: #selector(flipButtonTapped), for: .touchUpInside)
    }
    
    // MARK: - Flip Camera
    
    @objc
    func flipButtonTapped() {
        YPHaptics.impact(.light)
        videoHelper.flipCamera {}
    }
    
    func libraryTapped() {
        v.animateCardsOpen { [weak self] in
            self?.v.resetCards()
            self?.onOpenLibrary?()
        }
    }
    
    // MARK: - Toggle Recording
    
    @objc
    func shotButtonTapped() {
        doAfterCameraPermissionCheck { [weak self] in
            self?.doAfterMicrophonePermissionCheck {
                self?.toggleRecording()
            }
        }
    }
    
    private func toggleRecording() {
        videoHelper.isRecording ? stopRecording() : startRecording()
    }
    
    private func startRecording() {
        // Stop the screen from going to sleep while recording video
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = true
        }
        
        YPHaptics.success()
        YPHaptics.explosion()
        videoHelper.startRecording()
        updateState {
            $0.isRecording = true
        }
    }
    
    private func stopRecording() {
        // Reset screen always on to false since the need no longer exists
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = false
        }
        
        YPHaptics.success()
        YPHaptics.explosion()
        videoHelper.stopRecording()
        updateState {
            $0.isRecording = false
        }
    }

    public func stopCamera() {
        videoHelper.stopCamera()
    }
    
    // MARK: - Focus
    
    @objc
    func focusTapped(_ recognizer: UITapGestureRecognizer) {
        let point = recognizer.location(in: v.previewViewContainer)
        let viewsize = v.previewViewContainer.bounds.size
        let newPoint = CGPoint(x: point.x/viewsize.width, y: point.y/viewsize.height)
        videoHelper.focus(onPoint: newPoint)
        v.focusView.center = point
        YPHelper.configureFocusView(v.focusView)
        v.addSubview(v.focusView)
        YPHelper.animateFocusView(v.focusView)
    }
    
    // MARK: - Zoom
    
    @objc
    func pinch(_ recognizer: UIPinchGestureRecognizer) {
        self.zoom(recognizer: recognizer)
    }
    
    func zoom(recognizer: UIPinchGestureRecognizer) {
        videoHelper.zoom(began: recognizer.state == .began, scale: recognizer.scale)
    }
    
    // MARK: - UI State
    
    struct ViewState {
        var isRecording = false
        var progress: Float = 0
        var timeElapsed: TimeInterval = 0
    }
    
    private func updateState(block: (inout ViewState) -> Void) {
        block(&viewState)
        updateUIWith(state: viewState)
    }
    
    private func updateUIWith(state: ViewState) {
        v.shotButton.setImage(state.isRecording ? YPConfig.icons.captureVideoOnImage : YPConfig.icons.captureVideoImage,
                              for: .normal)
        v.flipButton.isEnabled = !state.isRecording
        v.progressBar.progress = state.progress
        v.timeElapsedLabel.text = YPHelper.formattedStrigFrom(state.timeElapsed)
        
        // Animate progress bar changes.
        UIView.animate(withDuration: 1, animations: v.progressBar.layoutIfNeeded)
    }
    
    private func resetVisualState() {
        updateState {
            $0.isRecording = self.videoHelper.isRecording
            $0.progress = 0
            $0.timeElapsed = 0
        }
    }
}
