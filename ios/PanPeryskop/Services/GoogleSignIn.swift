import SwiftUI
import GoogleSignIn

struct GoogleSignInResult {
    let identityToken: String
    let userIdentifier: String
    let fullName: String?
}

/// Performs the real (or DEBUG-simulated) Google sign-in.
@MainActor
final class GoogleSignInHandler {
    static let shared = GoogleSignInHandler()

    func perform(onSuccess: @escaping (GoogleSignInResult) -> Void, onError: @escaping (Error) -> Void) {
        #if DEBUG
        onSuccess(GoogleSignInResult(
            identityToken: "dev-google-" + UUID().uuidString,
            userIdentifier: "google-dev-" + String(UUID().uuidString.prefix(10)),
            fullName: nil
        ))
        #else
        guard let presenting = Self.topViewController() else {
            onError(NSError(domain: "GoogleSignIn", code: -1))
            return
        }
        GIDSignIn.sharedInstance.signIn(withPresenting: presenting) { result, error in
            if let error {
                onError(error)
                return
            }
            guard let user = result?.user, let idToken = user.idToken?.tokenString else {
                onError(NSError(domain: "GoogleSignIn", code: -2))
                return
            }
            onSuccess(GoogleSignInResult(
                identityToken: idToken,
                userIdentifier: user.userID ?? "",
                fullName: user.profile?.name
            ))
        }
        #endif
    }

    private static func topViewController() -> UIViewController? {
        let window = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
        var top = window?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }
}

/// White button matching the official Google Sign-In look.
struct GoogleSignInButton: View {
    var onSuccess: (GoogleSignInResult) -> Void
    var onError: (Error) -> Void

    var body: some View {
        Button {
            GoogleSignInHandler.shared.perform(onSuccess: onSuccess, onError: onError)
        } label: {
            HStack(spacing: 10) {
                GoogleGLogo()
                Text("Kontynuuj z Google")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(Color(red: 0.18, green: 0.18, blue: 0.18))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(Color.white)
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.black.opacity(0.12), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

/// Official multicolor Google "G" (drawn from the official SVG paths, viewBox 0 0 48 48).
struct GoogleGLogo: View {
    var body: some View {
        ZStack {
            Circle().fill(Color.white)
            Circle().stroke(Color.black.opacity(0.12), lineWidth: 0.5)

            GoogleGSegment(d: GoogleGPaths.red).fill(Color(red: 0.91, green: 0.29, blue: 0.24))
            GoogleGSegment(d: GoogleGPaths.blue).fill(Color(red: 0.26, green: 0.52, blue: 0.96))
            GoogleGSegment(d: GoogleGPaths.yellow).fill(Color(red: 0.96, green: 0.74, blue: 0.20))
            GoogleGSegment(d: GoogleGPaths.green).fill(Color(red: 0.28, green: 0.67, blue: 0.34))
        }
        .frame(width: 24, height: 24)
    }
}

private enum GoogleGPaths {
    static let red = "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    static let blue = "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    static let yellow = "M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    static let green = "M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
}

private struct GoogleGSegment: Shape {
    let d: String

    func path(in rect: CGRect) -> Path {
        let path = SVGPath.path(from: d)
        let scale = min(rect.width, rect.height) / 48
        return path.applying(CGAffineTransform(scaleX: scale, y: scale))
    }
}

/// Minimal SVG path parser (supports M/m, L/l, H/h, V/v, C/c, S/s, Z/z).
private enum SVGPath {
    static func path(from d: String) -> Path {
        var path = Path()
        let chars = Array(d)
        var i = 0
        var cmd: Character = "\0"
        var x: CGFloat = 0, y: CGFloat = 0
        var sx: CGFloat = 0, sy: CGFloat = 0
        var cx: CGFloat = 0, cy: CGFloat = 0

        func readNumber() -> CGFloat? {
            while i < chars.count && (chars[i] == " " || chars[i] == ",") { i += 1 }
            guard i < chars.count else { return nil }
            var sign: CGFloat = 1
            if chars[i] == "-" { sign = -1; i += 1 }
            else if chars[i] == "+" { i += 1 }
            var number = ""
            var digits = 0
            while i < chars.count {
                let c = chars[i]
                if c.isNumber || (c == "." && !number.contains(".")) {
                    number.append(c)
                    i += 1
                    digits += 1
                } else {
                    break
                }
            }
            guard digits > 0, let value = Double(number) else { return nil }
            return sign * CGFloat(value)
        }

        func nextCommand() -> Character? {
            while i < chars.count && chars[i] == " " { i += 1 }
            guard i < chars.count, chars[i].isLetter else { return nil }
            let c = chars[i]
            i += 1
            return c
        }

        while true {
            if let c = nextCommand() {
                cmd = c
            } else if cmd == "\0" {
                break
            }

            switch cmd {
            case "M", "m":
                guard let nx = readNumber(), let ny = readNumber() else { return path }
                if cmd == "M" { x = nx; y = ny } else { x += nx; y += ny }
                sx = x; sy = y
                path.move(to: CGPoint(x: x, y: y))
                cmd = cmd == "M" ? "L" : "l"
            case "L", "l":
                guard let nx = readNumber(), let ny = readNumber() else { return path }
                if cmd == "L" { x = nx; y = ny } else { x += nx; y += ny }
                path.addLine(to: CGPoint(x: x, y: y))
            case "H", "h":
                guard let nx = readNumber() else { return path }
                x = cmd == "H" ? nx : x + nx
                path.addLine(to: CGPoint(x: x, y: y))
            case "V", "v":
                guard let ny = readNumber() else { return path }
                y = cmd == "V" ? ny : y + ny
                path.addLine(to: CGPoint(x: x, y: y))
            case "C", "c":
                guard let a = readNumber(), let b = readNumber(),
                      let c2x = readNumber(), let c2y = readNumber(),
                      let ex = readNumber(), let ey = readNumber() else { return path }
                let relative = cmd == "c"
                let x1 = relative ? x + a : a
                let y1 = relative ? y + b : b
                let x2 = relative ? x + c2x : c2x
                let y2 = relative ? y + c2y : c2y
                let nx = relative ? x + ex : ex
                let ny = relative ? y + ey : ey
                path.addCurve(to: CGPoint(x: nx, y: ny), control1: CGPoint(x: x1, y: y1), control2: CGPoint(x: x2, y: y2))
                cx = x2; cy = y2
                x = nx; y = ny
            case "S", "s":
                guard let c2x = readNumber(), let c2y = readNumber(),
                      let ex = readNumber(), let ey = readNumber() else { return path }
                let relative = cmd == "s"
                let x1 = 2 * x - cx
                let y1 = 2 * y - cy
                let x2 = relative ? x + c2x : c2x
                let y2 = relative ? y + c2y : c2y
                let nx = relative ? x + ex : ex
                let ny = relative ? y + ey : ey
                path.addCurve(to: CGPoint(x: nx, y: ny), control1: CGPoint(x: x1, y: y1), control2: CGPoint(x: x2, y: y2))
                cx = x2; cy = y2
                x = nx; y = ny
            case "Z", "z":
                path.closeSubpath()
                x = sx; y = sy
                cmd = "\0"
            default:
                return path
            }
        }
        return path
    }
}
