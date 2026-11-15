import SwiftUI
import WebKit

// Restrict in-app hosts to keep App Store "Unrestricted Web Access = No" accurate.
enum AllowedWebDomains {
    static let registrableDomains: Set<String> = [
        "kupbilecik.pl", "goingapp.pl",
        "helios.pl", "cinema-city.pl", "multikino.pl",
        "meetup.com", "getyourguide.com", "maratonypolskie.pl",
        "lu.ma", "luma.com",
        "ebilet.pl", "tradedoubler.com",
        "eventim.pl", "awin1.com",
        "mtp.pl", "facebook.com", "fb.me",
        "booking.com", "airbnb.com", "espn.com",
        "viator.com",
        "ticketmaster.pl", "ra.co",
    ]

    static func isAllowed(_ host: String) -> Bool {
        let host = host.lowercased()
        return registrableDomains.contains { host == $0 || host.hasSuffix("." + $0) }
    }
}

struct InAppBrowserView: View {
    let url: URL
    var bottomInset: CGFloat = 0
    var allowAnyHost: Bool = false
    var onClose: () -> Void = {}

    @StateObject private var model = BrowserModel()

    var body: some View {
        VStack(spacing: 0) {
            BrowserWebView(url: url, model: model, allowAnyHost: allowAnyHost, onClose: onClose)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .overlay { if model.loadFailed { loadFailedView } }
            Divider()
            toolbar
        }
        .background(Color(.systemBackground))
        .onAppear {
            MetaSignals.outbound(url: url)
            ProductAnalytics.outbound(url: url)
        }
    }

    private var loadFailedView: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 40))
                .foregroundColor(.secondary)
            Text("Nie można załadować strony")
                .font(.subheadline)
                .foregroundColor(.secondary)
            Button("Otwórz w Safari") {
                model.openInSystemBrowser(fallback: url)
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

    private var toolbar: some View {
        HStack {
            Button {
                model.openInSystemBrowser(fallback: url)
            } label: {
                Image(systemName: "globe")
            }
            .buttonStyle(.borderless)

            Spacer()

            HStack(spacing: 48) {
                Button {
                    model.goBack()
                } label: {
                    Image(systemName: "chevron.left")
                }
                .buttonStyle(.borderless)
                .disabled(!model.canGoBack)
                .opacity(model.canGoBack ? 1 : 0.35)

                Button {
                    model.goForward()
                } label: {
                    Image(systemName: "chevron.right")
                }
                .buttonStyle(.borderless)
                .disabled(!model.canGoForward)
                .opacity(model.canGoForward ? 1 : 0.35)
            }

            Spacer()

            Button {
                onClose()
            } label: {
                Image(systemName: "xmark")
            }
            .buttonStyle(.borderless)
        }
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(.primary)
        .padding(.horizontal, 28)
        .padding(.top, 14)
        .padding(.bottom, bottomInset + 12)
        .background(.regularMaterial)
    }
}

private struct BrowserWebView: UIViewRepresentable {
    let url: URL
    @ObservedObject var model: BrowserModel
    var allowAnyHost: Bool = false
    var onClose: () -> Void = {}

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model, allowAnyHost: allowAnyHost, onClose: onClose)
    }

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView(frame: .zero, configuration: makeConfiguration())
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        NoZoomWebView.lock(webView)
        context.coordinator.attach(webView)
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        context.coordinator.onClose = onClose
    }

    private func makeConfiguration() -> WKWebViewConfiguration {
        let configuration = WKWebViewConfiguration()
        // Deny geolocation and push silently so third-party ticket pages never trigger iOS prompts.
        configuration.userContentController.addUserScript(
            WKUserScript(source: Self.permissionStub, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        )
        configuration.userContentController.addUserScript(NoZoomWebView.userScript())
        return configuration
    }

    private static let permissionStub = """
    (function () {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition = function (_ok, err) { if (err) err({ code: 1, message: 'denied' }); };
        navigator.geolocation.watchPosition = function (_ok, err) { if (err) err({ code: 1, message: 'denied' }); };
        navigator.geolocation.clearWatch = function () {};
      }
      if (window.Notification && Notification.requestPermission) {
        Notification.requestPermission = function () { return Promise.resolve('denied'); };
      }
      if (navigator.permissions && navigator.permissions.query) {
        var q = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = function (desc) {
          if (desc && (desc.name === 'geolocation' || desc.name === 'notifications')) {
            return Promise.resolve({ state: 'denied', onchange: null });
          }
          return q(desc);
        };
      }
    })();
    """

    @MainActor
    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate {
        let model: BrowserModel
        let allowAnyHost: Bool
        var onClose: () -> Void
        private var didAutoClose = false
        private var observations: [NSKeyValueObservation] = []

        init(model: BrowserModel, allowAnyHost: Bool, onClose: @escaping () -> Void) {
            self.model = model
            self.allowAnyHost = allowAnyHost
            self.onClose = onClose
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            if navigationAction.targetFrame?.isMainFrame == true,
               !isAllowedWebNavigation(to: url) {
                decisionHandler(.cancel)
                openExternally(url)
                closeIfUncommitted()
                return
            }
            decisionHandler(.allow)
        }

        private func isAllowedWebNavigation(to url: URL) -> Bool {
            let scheme = url.scheme?.lowercased()
            guard scheme == "http" || scheme == "https" else { return false }
            if allowAnyHost { return true }
            return url.host.map(AllowedWebDomains.isAllowed) == true
        }

        private func openExternally(_ url: URL) {
            guard url.scheme?.lowercased() != "about" else { return }
            UIApplication.shared.open(url)
        }

        private func closeIfUncommitted() {
            guard !model.hasCommittedPage, !didAutoClose else { return }
            didAutoClose = true
            onClose()
        }

        func attach(_ webView: WKWebView) {
            model.webView = webView
            observations = [
                webView.observe(\.canGoBack, options: [.new]) { [weak self] webView, _ in
                    MainActor.assumeIsolated { self?.publishBack(from: webView) }
                },
                webView.observe(\.canGoForward, options: [.new]) { [weak self] webView, _ in
                    MainActor.assumeIsolated { self?.publishForward(from: webView) }
                },
                webView.observe(\.url, options: [.new]) { [weak self] webView, _ in
                    MainActor.assumeIsolated { self?.publishURL(from: webView) }
                },
            ]
            publishBack(from: webView)
            publishForward(from: webView)
            publishURL(from: webView)
        }

        private func publishBack(from webView: WKWebView) {
            guard model.canGoBack != webView.canGoBack else { return }
            model.canGoBack = webView.canGoBack
        }

        private func publishForward(from webView: WKWebView) {
            guard model.canGoForward != webView.canGoForward else { return }
            model.canGoForward = webView.canGoForward
        }

        private func publishURL(from webView: WKWebView) {
            model.currentURL = webView.url
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            guard let url = navigationAction.request.url else { return nil }
            if isAllowedWebNavigation(to: url) {
                webView.load(URLRequest(url: url))
            } else {
                openExternally(url)
            }
            return nil
        }

        func webView(
            _ webView: WKWebView,
            requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo,
            type: WKMediaCaptureType,
            decisionHandler: @escaping @MainActor (WKPermissionDecision) -> Void
        ) {
            decisionHandler(.deny)
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            model.loadFailed = false
        }

        func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
            model.hasCommittedPage = true
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            reportFailure(error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            reportFailure(error)
        }

        private func reportFailure(_ error: Error) {
            let nsError = error as NSError
            let interrupted = nsError.domain == "WebKitErrorDomain" && nsError.code == 102
            guard nsError.code != NSURLErrorCancelled, !interrupted else { return }
            model.loadFailed = true
        }
    }
}

@MainActor
final class BrowserModel: ObservableObject {
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var loadFailed = false
    @Published var hasCommittedPage = false
    var currentURL: URL?

    weak var webView: WKWebView?

    func goBack() {
        webView?.goBack()
    }

    func goForward() {
        webView?.goForward()
    }

    func openInSystemBrowser(fallback: URL) {
        UIApplication.shared.open(currentURL ?? fallback)
    }
}
