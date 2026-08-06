import SwiftUI
import AuthenticationServices

struct AppleSignInResult {
    let identityToken: String
    let userIdentifier: String
    let fullName: String?
}

/// Wraps the native Sign in with Apple button. In DEBUG it simulates a successful
/// sign-in (fake token) so the whole flow is testable without a paid Apple Developer
/// account / App ID capability.
struct AppleSignInButton: UIViewRepresentable {
    let onSuccess: (AppleSignInResult) -> Void
    let onError: (Error) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeUIView(context: Context) -> ASAuthorizationAppleIDButton {
        let button = ASAuthorizationAppleIDButton(type: .signIn, style: .black)
        button.addTarget(context.coordinator, action: #selector(Coordinator.handleTap), for: .touchUpInside)
        return button
    }

    func updateUIView(_ uiView: ASAuthorizationAppleIDButton, context: Context) {}

    final class Coordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
        private let parent: AppleSignInButton

        init(parent: AppleSignInButton) { self.parent = parent }

        @objc func handleTap() {
            #if DEBUG
            parent.onSuccess(AppleSignInResult(
                identityToken: "dev-apple-" + UUID().uuidString,
                userIdentifier: "apple-dev-" + String(UUID().uuidString.prefix(10)),
                fullName: nil
            ))
            #else
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
            #endif
        }

        func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
            let window = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap { $0.windows }
                .first { $0.isKeyWindow }
            return window ?? ASPresentationAnchor()
        }

        func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let token = String(data: tokenData, encoding: .utf8) else {
                parent.onError(NSError(domain: "AppleSignIn", code: -1))
                return
            }
            let name = [credential.fullName?.givenName, credential.fullName?.familyName]
                .compactMap { $0 }
                .joined(separator: " ")
            parent.onSuccess(AppleSignInResult(
                identityToken: token,
                userIdentifier: credential.user,
                fullName: name.isEmpty ? nil : name
            ))
        }

        func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
            parent.onError(error)
        }
    }
}
