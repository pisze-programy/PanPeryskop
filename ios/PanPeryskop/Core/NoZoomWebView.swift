import WebKit

/// The non-interactive previews must not fight the sheet drag, so they stay at 100%.
enum NoZoomWebView {
    static func userScript() -> WKUserScript {
        let source = """
        (function () {
          var scale = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
          var meta = document.querySelector('meta[name=viewport]');
          if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', 'viewport');
            document.head.appendChild(meta);
          }
          meta.setAttribute('content', scale);
        })();
        """
        return WKUserScript(source: source, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
    }

    static func lock(_ webView: WKWebView) {
        webView.scrollView.minimumZoomScale = 1
        webView.scrollView.maximumZoomScale = 1
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
    }
}
