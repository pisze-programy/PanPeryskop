import SwiftUI
import WebKit

/// In-app browser presented as a bottom sheet (max 70% of the screen height).
/// Every external web link opens here first; the bottom toolbar offers
/// open-in-system-browser (globe), back/forward and close.
struct InAppBrowserView: View {
    let url: URL
    /// Bottom safe-area inset (home indicator) so the toolbar lifts above it.
    var bottomInset: CGFloat = 0
    /// Called when the user closes the browser (X button).
    var onClose: () -> Void = {}

    @StateObject private var model = BrowserModel()

    var body: some View {
        VStack(spacing: 0) {
            BrowserWebView(url: url, model: model)
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

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        context.coordinator.attach(webView)
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKUIDelegate {
        let model: BrowserModel
        private var observations: [NSKeyValueObservation] = []

        init(model: BrowserModel) {
            self.model = model
        }

        func attach(_ webView: WKWebView) {
            model.webView = webView
            observations = [
                webView.observe(\.canGoBack, options: [.new]) { [weak self] webView, _ in
                    self?.model.canGoBack = webView.canGoBack
                },
                webView.observe(\.canGoForward, options: [.new]) { [weak self] webView, _ in
                    self?.model.canGoForward = webView.canGoForward
                },
                webView.observe(\.url, options: [.new]) { [weak self] webView, _ in
                    self?.model.currentURL = webView.url
                },
            ]
            model.canGoBack = webView.canGoBack
            model.canGoForward = webView.canGoForward
            model.currentURL = webView.url
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url {
                webView.load(URLRequest(url: url))
            }
            return nil
        }
    }
}

/// Navigation state + actions for the in-app browser toolbar.
final class BrowserModel: ObservableObject {
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var currentURL: URL?

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
