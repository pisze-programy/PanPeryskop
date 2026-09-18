import SwiftUI
import WebKit

/// Registrable domains the in-app browser may load. Any main-frame navigation to a
/// host outside this list is cancelled and handed off to the system browser, so the
/// app never becomes an unrestricted browser (keeps the App Store age-rating
/// "Unrestricted Web Access = No" honest).
/// ponytail: hand-maintained; keep in sync with backend seed providers
/// (backend/src/seed/core/constants.ts) and any new link_url source.
enum AllowedWebDomains {
    static let registrableDomains: Set<String> = [
        "kupbilecik.pl", "goingapp.pl",
        "helios.pl", "cinema-city.pl", "multikino.pl",
        "meetup.com", "getyourguide.com", "maratonypolskie.pl",
        "lu.ma", "luma.com",
        "ebilet.pl", "tradedoubler.com",
        "booking.com", "airbnb.com", "espn.com",
        "viator.com",
    ]

    /// Exact host or a subdomain of a registrable domain, e.g. "bilety.helios.pl".
    static func isAllowed(_ host: String) -> Bool {
        let host = host.lowercased()
        return registrableDomains.contains { host == $0 || host.hasSuffix("." + $0) }
    }
}

/// In-app browser presented as a bottom sheet (max 70% of the screen height).
/// Every external web link opens here first; the bottom toolbar offers
/// open-in-system-browser (globe), back/forward and close.
struct InAppBrowserView: View {
    let url: URL
    /// Bottom safe-area inset (home indicator) so the toolbar lifts above it.
    var bottomInset: CGFloat = 0
    /// True for links that may leave the fixed allow-list (race websites with
    /// external redirects) — any http(s) host is kept in-app.
    var allowAnyHost: Bool = false
    /// Called when the user closes the browser (X button).
    var onClose: () -> Void = {}

    @StateObject private var model = BrowserModel()

    var body: some View {
        VStack(spacing: 0) {
            BrowserWebView(url: url, model: model, allowAnyHost: allowAnyHost)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            Divider()
            toolbar
        }
        .background(Color(.systemBackground))
    }

    /// Full-width bottom toolbar — icons respond to taps only (no drag gestures).
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

/// WKWebView bridge — keeps the toolbar state (canGoBack/canGoForward/currentURL)
/// in sync via KVO (reliable across navigation events) and routes `target=_blank`
/// links back into the same web view.
private struct BrowserWebView: UIViewRepresentable {
    let url: URL
    @ObservedObject var model: BrowserModel
    var allowAnyHost: Bool = false

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model, allowAnyHost: allowAnyHost)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        // Block pages from triggering system permission prompts (location, push
        // notifications, geolocation-permissions query) — providers in the
        // allow-list often request them and the user wants none of that in-app.
        let permissionStub = """
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
        configuration.userContentController.addUserScript(
            WKUserScript(source: permissionStub, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        )
        configuration.userContentController.addUserScript(NoZoomWebView.userScript())
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        NoZoomWebView.lock(webView)
        context.coordinator.attach(webView)
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate {
        let model: BrowserModel
        let allowAnyHost: Bool
        private var observations: [NSKeyValueObservation] = []

        init(model: BrowserModel, allowAnyHost: Bool) {
            self.model = model
            self.allowAnyHost = allowAnyHost
        }

        /// In-app browsing stays on the allow-list; any other main-frame navigation
        /// (outbound link, payment hop, non-web scheme) is bounced straight to the
        /// system browser so the flow keeps working without unrestricted in-app web.
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
            UIApplication.shared.open(url)
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
            if let url = navigationAction.request.url {
                if isAllowedWebNavigation(to: url) {
                    webView.load(URLRequest(url: url))
                } else {
                    openExternally(url)
                }
            }
            return nil
        }

        /// Never grant camera/mic/screen access — the in-app browser is read-only.
        func webView(
            _ webView: WKWebView,
            requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo,
            type: WKMediaCaptureType,
            decisionHandler: @escaping @MainActor (WKPermissionDecision) -> Void
        ) {
            decisionHandler(.deny)
        }
    }
}

/// Navigation state + actions for the in-app browser toolbar.
@MainActor
final class BrowserModel: ObservableObject {
    @Published var canGoBack = false
    @Published var canGoForward = false
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
