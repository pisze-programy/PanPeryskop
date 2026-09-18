import SwiftUI
import UIKit
import WebKit

struct Stay22MapView: UIViewRepresentable {
    let url: URL
    var isInteractive = true
    var onFailure: () -> Void = {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onFailure: onFailure)
    }

    func makeUIView(context: Context) -> WKWebView {
        let webView = WebKitWarmup.take() ?? makeWebView()
        configure(webView, context: context)
        context.coordinator.loaded = url
        webView.load(request(url))
        return webView
    }

    private func request(_ url: URL) -> URLRequest {
        URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 30)
    }

    private func makeWebView() -> WKWebView {
        WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
    }

    private func configure(_ webView: WKWebView, context: Context) {
        webView.isHidden = false
        webView.isUserInteractionEnabled = isInteractive
        webView.isOpaque = true
        webView.backgroundColor = .systemBackground
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        lockZoom(on: webView)
    }

    private func lockZoom(on webView: WKWebView) {
        guard !isInteractive else { return }
        webView.configuration.userContentController.addUserScript(NoZoomWebView.userScript())
        NoZoomWebView.lock(webView)
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        webView.isUserInteractionEnabled = isInteractive
        guard context.coordinator.loaded != url else { return }
        context.coordinator.loaded = url
        webView.load(request(url))
    }

    @MainActor
    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate {
        private let onFailure: () -> Void
        var loaded: URL?

        init(onFailure: @escaping () -> Void) {
            self.onFailure = onFailure
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url,
                  navigationAction.targetFrame?.isMainFrame == true else {
                decisionHandler(.allow)
                return
            }
            guard isWidgetPage(url) else {
                decisionHandler(.cancel)
                openExternally(url)
                return
            }
            decisionHandler(.allow)
        }

        /// Every new window is an outbound link (hotel card, Allez). It leaves
        /// the app, so the map never loses the embed page.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url {
                openExternally(url)
            }
            return nil
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            report(error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            report(error)
        }

        /// The system kills the web content process under memory pressure (the
        /// full sheet opens a second map). Reload instead of showing a blank map.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.reload()
        }

        private func report(_ error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            onFailure()
        }

        private func isWidgetPage(_ url: URL) -> Bool {
            guard url.scheme == "http" || url.scheme == "https" else { return false }
            guard url.path.lowercased().contains("/allez") == false else { return false }
            guard let host = url.host?.lowercased() else { return false }
            return host == "stay22.com" || host.hasSuffix(".stay22.com")
        }

        private func openExternally(_ url: URL) {
            DispatchQueue.main.async {
                UIApplication.shared.open(url)
            }
        }
    }
}
