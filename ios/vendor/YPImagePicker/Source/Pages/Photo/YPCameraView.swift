//
//  YPCameraView.swift
//  YPImgePicker
//
//  Created by Sacha Durand Saint Omer on 2015/11/14.
//  Copyright © 2015 Yummypets. All rights reserved.
//

import UIKit
import Stevia

internal class YPCameraView: UIView, UIGestureRecognizerDelegate {
    let focusView = UIView(frame: CGRect(x: 0, y: 0, width: 90, height: 90))
    let previewViewContainer = UIView()
    let buttonsContainer = UIView()
    let flipButton = UIButton()
    let shotButton = UIButton()
    let flashButton = UIButton()
    let timeElapsedLabel = UILabel()
    let progressBar = UIProgressView()
    let loadingIndicator = UIActivityIndicatorView(style: .large)
    
    convenience init(overlayView: UIView? = nil) {
        self.init(frame: .zero)
        
        if let overlayView = overlayView {
            // View Hierarchy
            subviews(
                previewViewContainer,
                overlayView,
                loadingIndicator,
                progressBar,
                timeElapsedLabel,
                flashButton,
                flipButton,
                buttonsContainer.subviews(
                    shotButton
                )
            )
        } else {
            // View Hierarchy
            subviews(
                previewViewContainer,
                loadingIndicator,
                progressBar,
                timeElapsedLabel,
                flashButton,
                flipButton,
                buttonsContainer.subviews(
                    shotButton
                )
            )
        }
        
        // Layout
        let height = window?.windowScene?.screen.bounds.height ?? .zero
        let isIphone4 = height == 480
        let sideMargin: CGFloat = isIphone4 ? 20 : 0
        if YPConfig.onlySquareImagesFromCamera {
            layout(
                0,
                |-sideMargin-previewViewContainer-sideMargin-|,
                -2,
                |progressBar|,
                0,
                |buttonsContainer|,
                0
            )
            
            previewViewContainer.heightEqualsWidth()
        } else {
            layout(
                0,
                |-sideMargin-previewViewContainer-sideMargin-|,
                -2,
                |progressBar|,
                0
            )
            
            previewViewContainer.fillContainer()
            
            buttonsContainer.fillHorizontally()
            buttonsContainer.height(100)
            buttonsContainer.Bottom == previewViewContainer.Bottom - 50
        }
        
        overlayView?.followEdges(previewViewContainer)
        
        loadingIndicator.centerInContainer()
        
        |-(15+sideMargin)-flashButton.size(42)
        flashButton.Bottom == previewViewContainer.Bottom - 15
        
        flipButton.size(42)-(15+sideMargin)-|
        flipButton.Bottom == previewViewContainer.Bottom - 15
        
        timeElapsedLabel.centerHorizontally()
        timeElapsedLabel.Bottom == buttonsContainer.Top - 16
        
        shotButton.centerVertically()
        shotButton.size(84).centerHorizontally()
        
        // Style
        backgroundColor = YPConfig.colors.photoVideoScreenBackgroundColor
        previewViewContainer.backgroundColor = YPConfig.colors.photoVideoScreenBackgroundColor
        loadingIndicator.color = .white
        loadingIndicator.hidesWhenStopped = true
        timeElapsedLabel.style { l in
            l.textColor = .white
            l.text = "00:00"
            l.isHidden = true
            l.font = YPConfig.fonts.cameraTimeElapsedFont
            l.backgroundColor = .ypSystemRed
            l.textAlignment = .center
            l.layer.cornerRadius = 6
            l.clipsToBounds = true
        }
        timeElapsedLabel.height(22)
        timeElapsedLabel.width(56)
        progressBar.style { p in
            p.trackTintColor = .clear
            p.tintColor = .ypSystemRed
        }
        flashButton.setImage(YPConfig.icons.flashOffIcon, for: .normal)
        flipButton.setImage(YPConfig.icons.loopIcon, for: .normal)
        shotButton.setImage(YPConfig.icons.capturePhotoImage, for: .normal)
    }
}
