// swift-tools-version:5.7
import PackageDescription
// Vendored from https://github.com/gh123man/SwiftUI-LazyPager (1.0.0).
// Patched locally: PagerView.init sets alwaysBounceVertical = true so the
// overscroll (exit) gesture fires even for a single-page deck.
let package = Package(
    name: "LazyPager",
    platforms: [
        .iOS(.v15)
    ],
    products: [
        .library(name: "LazyPager", targets: ["LazyPager"])
    ],
    targets: [
        .target(name: "LazyPager", path: "Sources")
    ]
)
