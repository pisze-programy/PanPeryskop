import WebKit

/// The first web view in the process pays WebKit's start-up cost (framework and
/// web content process). Keep a small pool warm while the user reads the event
/// details, so the mini map and the full sheet never start cold. The warmed page
/// preconnects to the map host, so DNS/TLS are ready too.
@MainActor
enum WebKitWarmup {
    private static var pool: [WKWebView] = []
    private static let capacity = 2
    private static var isRefilling = false

    static func warm() {
        refill()
    }

    static func take() -> WKWebView? {
        let webView = pool.popLast()
        refill()
        return webView
    }

    private static func refill() {
        guard !isRefilling, pool.count < capacity else { return }
        isRefilling = true
        Task { @MainActor in
            while pool.count < capacity {
                pool.append(make())
                await Task.yield()
            }
            isRefilling = false
        }
    }

    private static func make() -> WKWebView {
        let webView = WKWebView(
            frame: CGRect(x: 0, y: 0, width: 1, height: 1),
            configuration: WKWebViewConfiguration()
        )
        webView.isHidden = true
        webView.loadHTMLString(preconnectHTML, baseURL: nil)
        return webView
    }

    private static let preconnectHTML = """
    <html><head>
    <link rel="preconnect" href="https://www.stay22.com" crossorigin>
    <link rel="dns-prefetch" href="https://www.stay22.com">
    </head><body></body></html>
    """
}
