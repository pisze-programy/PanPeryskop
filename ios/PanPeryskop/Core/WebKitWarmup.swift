import WebKit

/// The first web view in the process pays WebKit's start-up cost (framework and
/// web content process). Warm it while the user reads the event details, then
/// hand the same view to the first hotel map — no second start-up, and no early
/// teardown for the system to log.
@MainActor
enum WebKitWarmup {
    private static var warmed: WKWebView?
    private static var didWarm = false

    static func warm() {
        guard !didWarm else { return }
        didWarm = true
        let webView = WKWebView(
            frame: CGRect(x: 0, y: 0, width: warmupSide, height: warmupSide),
            configuration: WKWebViewConfiguration()
        )
        webView.isHidden = true
        webView.loadHTMLString("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">", baseURL: nil)
        warmed = webView
    }

    static func take() -> WKWebView? {
        let webView = warmed
        warmed = nil
        return webView
    }

    private static let warmupSide: CGFloat = 1
}
