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
    let timeElapsedLabel = UILabel()
    let progressBar = UIProgressView()
    let loadingIndicator = UIActivityIndicatorView(style: .large)
    let modeSelector = ModeSelectorView()

    let libraryStackView = UIView()
    let frontCardView = UIImageView()
    let backCardView = UIImageView()
    let libraryButton = UIButton()

    /// Invoked when the user taps the library card stack.
    var onOpenLibrary: (() -> Void)?

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
                flipButton,
                modeSelector,
                buttonsContainer.subviews(
                    shotButton
                ),
                libraryStackView
            )
        } else {
            // View Hierarchy
            subviews(
                previewViewContainer,
                loadingIndicator,
                progressBar,
                timeElapsedLabel,
                flipButton,
                modeSelector,
                buttonsContainer.subviews(
                    shotButton
                ),
                libraryStackView
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
            buttonsContainer.Bottom == previewViewContainer.Bottom - 70
        }
        
        modeSelector.width(132).height(34)
        modeSelector.centerHorizontally()
        modeSelector.Bottom == previewViewContainer.Bottom - 20
        
        overlayView?.followEdges(previewViewContainer)
        
        loadingIndicator.centerInContainer()
        
        setupLibraryCards(sideMargin: sideMargin)

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
        flipButton.setImage(YPConfig.icons.loopIcon, for: .normal)
        shotButton.setImage(YPConfig.icons.capturePhotoImage, for: .normal)
    }

    // MARK: - Library cards

    private func setupLibraryCards(sideMargin: CGFloat) {
        libraryStackView.translatesAutoresizingMaskIntoConstraints = false
        libraryStackView.layer.shadowColor = UIColor.black.cgColor
        libraryStackView.layer.shadowOpacity = 0.3
        libraryStackView.layer.shadowRadius = 4
        libraryStackView.layer.shadowOffset = CGSize(width: 0, height: 2)
        libraryStackView.isUserInteractionEnabled = true

        for card in [frontCardView, backCardView] {
            card.translatesAutoresizingMaskIntoConstraints = false
            card.contentMode = .scaleAspectFill
            card.clipsToBounds = true
            card.layer.cornerRadius = 12
            card.layer.borderWidth = 1
            card.layer.borderColor = UIColor.white.withAlphaComponent(0.9).cgColor
            libraryStackView.addSubview(card)
        }

        // Placeholder cards — Photos is never touched on the camera screen.
        // The real gallery (and its limited-access prompt) opens on tap.
        frontCardView.backgroundColor = UIColor.systemIndigo.withAlphaComponent(0.45)
        frontCardView.image = UIImage(systemName: "photo.on.rectangle")
            ?? UIImage(systemName: "photo")
        frontCardView.tintColor = .white

        backCardView.backgroundColor = UIColor.systemTeal.withAlphaComponent(0.3)
        backCardView.image = nil
        backCardView.isHidden = false

        libraryStackView.addSubview(libraryButton)
        libraryButton.translatesAutoresizingMaskIntoConstraints = false
        libraryButton.addTarget(self, action: #selector(libraryTapped), for: .touchUpInside)

        NSLayoutConstraint.activate([
            libraryStackView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 15 + sideMargin),
            libraryStackView.bottomAnchor.constraint(equalTo: previewViewContainer.bottomAnchor, constant: -15),

            libraryStackView.widthAnchor.constraint(equalToConstant: 56),
            libraryStackView.heightAnchor.constraint(equalToConstant: 56),

            frontCardView.widthAnchor.constraint(equalToConstant: 46),
            frontCardView.heightAnchor.constraint(equalToConstant: 46),
            frontCardView.centerXAnchor.constraint(equalTo: libraryStackView.centerXAnchor),
            frontCardView.centerYAnchor.constraint(equalTo: libraryStackView.centerYAnchor),

            backCardView.widthAnchor.constraint(equalToConstant: 46),
            backCardView.heightAnchor.constraint(equalToConstant: 46),
            backCardView.centerXAnchor.constraint(equalTo: libraryStackView.centerXAnchor, constant: 9),
            backCardView.centerYAnchor.constraint(equalTo: libraryStackView.centerYAnchor, constant: 9),

            libraryButton.leadingAnchor.constraint(equalTo: libraryStackView.leadingAnchor),
            libraryButton.trailingAnchor.constraint(equalTo: libraryStackView.trailingAnchor),
            libraryButton.topAnchor.constraint(equalTo: libraryStackView.topAnchor),
            libraryButton.bottomAnchor.constraint(equalTo: libraryStackView.bottomAnchor),
        ])
    }

    @objc private func libraryTapped() {
        let feedback = UIImpactFeedbackGenerator(style: .light)
        feedback.prepare()
        feedback.impactOccurred()
        onOpenLibrary?()
    }

    /// Subtle one-time appear animation so the stack doesn't just pop in.
    func playAppearAnimation() {
        frontCardView.alpha = 0
        backCardView.alpha = 0
        libraryStackView.alpha = 0
        UIView.animate(withDuration: 0.45, delay: 0, usingSpringWithDamping: 0.7, initialSpringVelocity: 0.5, options: []) {
            self.frontCardView.alpha = 1
            self.backCardView.alpha = 1
            self.libraryStackView.alpha = 1
        }
    }

    /// Slightly spreads the two cards apart — minimal lateral shift, angled outward
    /// (diagonal) — before opening the gallery.
    func animateCardsOpen(completion: @escaping () -> Void) {
        let feedback = UIImpactFeedbackGenerator(style: .soft)
        feedback.prepare()
        feedback.impactOccurred()
        UIView.animate(withDuration: 0.18, delay: 0, usingSpringWithDamping: 0.8, initialSpringVelocity: 0.5, options: [.curveEaseOut], animations: {
            self.frontCardView.transform = CGAffineTransform(translationX: -7, y: -5)
                .rotated(by: -0.09)
            self.backCardView.transform = CGAffineTransform(translationX: 7, y: 5)
                .rotated(by: 0.09)
            self.libraryStackView.alpha = 0.7
        }, completion: { _ in
            completion()
        })
    }

    func resetCards() {
        frontCardView.transform = .identity
        backCardView.transform = .identity
        frontCardView.alpha = 1
        backCardView.alpha = 1
        libraryStackView.alpha = 1
    }
}

final class ModeSelectorView: UIView {
    var onSelect: ((Int) -> Void)?
    private(set) var selectedIndex = 0
    private let fotoButton = UIButton(type: .system)
    private let videoButton = UIButton(type: .system)

    override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
    }

    required init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setup() {
        backgroundColor = .clear
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.25
        layer.shadowRadius = 6
        layer.shadowOffset = CGSize(width: 0, height: 2)

        let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterialDark))
        blur.layer.cornerRadius = 17
        blur.clipsToBounds = true
        blur.translatesAutoresizingMaskIntoConstraints = false
        addSubview(blur)
        NSLayoutConstraint.activate([
            blur.leadingAnchor.constraint(equalTo: leadingAnchor),
            blur.trailingAnchor.constraint(equalTo: trailingAnchor),
            blur.topAnchor.constraint(equalTo: topAnchor),
            blur.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])

        let stack = UIStackView(arrangedSubviews: [fotoButton, videoButton])
        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.spacing = 3
        stack.translatesAutoresizingMaskIntoConstraints = false
        blur.contentView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: blur.contentView.leadingAnchor, constant: 3),
            stack.trailingAnchor.constraint(equalTo: blur.contentView.trailingAnchor, constant: -3),
            stack.topAnchor.constraint(equalTo: blur.contentView.topAnchor, constant: 3),
            stack.bottomAnchor.constraint(equalTo: blur.contentView.bottomAnchor, constant: -3),
        ])

        configure(fotoButton, title: "Foto", tag: 0)
        configure(videoButton, title: "Wideo", tag: 1)
        setSelected(0)
    }

    private func configure(_ button: UIButton, title: String, tag: Int) {
        button.setTitle(title, for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
        button.tag = tag
        button.addTarget(self, action: #selector(segmentTapped(_:)), for: .touchUpInside)
        button.layer.cornerRadius = 14
        button.clipsToBounds = true
    }

    func setSelected(_ index: Int) {
        selectedIndex = index
        updateButton(fotoButton, selected: index == 0)
        updateButton(videoButton, selected: index == 1)
    }

    private func updateButton(_ button: UIButton, selected: Bool) {
        button.backgroundColor = selected ? UIColor.white.withAlphaComponent(0.92) : .clear
        button.setTitleColor(selected ? .black : .white, for: .normal)
    }

    @objc private func segmentTapped(_ sender: UIButton) {
        guard sender.tag != selectedIndex else { return }
        setSelected(sender.tag)
        onSelect?(sender.tag)
    }
}
