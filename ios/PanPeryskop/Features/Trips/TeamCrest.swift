import SwiftUI

struct TeamCrest: View {
    let name: String
    var code: String?
    var colorHex: String?
    var teamId: String? = nil
    var size: CGFloat = TeamCrest.defaultSize

    @State private var loadedImage: UIImage?
    @State private var loadedTeamId: String?

    private static let defaultSize: CGFloat = 46
    private static let gradientTopOpacity: Double = 0.92
    private static let outlineOpacity: Double = 0.35
    private static let codeSizeRatio: CGFloat = 0.3
    private static let codeMinScale: CGFloat = 0.6
    private static let codeHorizontalPadding: CGFloat = 3
    private static let initialsCount = 2
    private static let lumaRed = 0.299
    private static let lumaGreen = 0.587
    private static let lumaBlue = 0.114
    private static let lightThreshold = 0.6
    private static let byteMax = 255.0

    var body: some View {
        Group {
            if let image = displayedImage {
                image
                    .resizable()
                    .scaledToFit()
                    .frame(width: size, height: size)
            } else {
                fallbackShield
            }
        }
        .task(id: normalizedTeamId) { await loadCrest() }
    }

    private var fallbackShield: some View {
        ZStack {
            Image(systemName: "shield.fill")
                .font(.system(size: size))
                .foregroundStyle(
                    LinearGradient(
                        colors: [fill.opacity(Self.gradientTopOpacity), fill],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            Image(systemName: "shield")
                .font(.system(size: size))
                .foregroundStyle(outlineColor)
            Text(displayCode)
                .font(.system(size: size * Self.codeSizeRatio, weight: .heavy))
                .minimumScaleFactor(Self.codeMinScale)
                .padding(.horizontal, Self.codeHorizontalPadding)
                .foregroundColor(Self.isLight(colorHex) ? .black : .white)
        }
    }

    private var normalizedTeamId: String? {
        guard let trimmed = teamId?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else { return nil }
        return trimmed
    }

    private var crestURL: URL? {
        guard let id = normalizedTeamId else { return nil }
        return URL(string: "\(APIClient.baseURL)/media/crests/espn/\(id).png")
    }

    private var displayedImage: Image? {
        if let id = normalizedTeamId, loadedTeamId == id, let loadedImage {
            return Image(uiImage: loadedImage)
        }
        guard let url = crestURL, let cached = RemoteImageStore.shared.cached(url) else {
            return nil
        }
        return Image(uiImage: cached)
    }

    private func loadCrest() async {
        guard let targetId = normalizedTeamId, let url = crestURL else {
            apply(nil, for: nil)
            return
        }
        if let hit = RemoteImageStore.shared.cached(url) {
            apply(hit, for: targetId)
            return
        }
        apply(nil, for: nil)
        let image = await RemoteImageStore.shared.load(url)
        guard !Task.isCancelled else { return }
        apply(image, for: targetId)
    }

    private func apply(_ image: UIImage?, for targetId: String?) {
        loadedTeamId = targetId
        loadedImage = image
    }

    private var outlineColor: Color {
        Self.isLight(colorHex) ? Color.black.opacity(Self.outlineOpacity) : Color.white.opacity(Self.outlineOpacity)
    }

    private var fill: Color {
        if let colorHex, let color = Color(hexString: colorHex) { return color }
        return Self.color(for: name)
    }

    private var displayCode: String {
        if let code, !code.isEmpty { return code.uppercased() }
        return Self.initials(name)
    }

    static func initials(_ name: String) -> String {
        let words = name.split(separator: " ").prefix(Self.initialsCount)
        let letters = words.compactMap { $0.first }.map(String.init)
        return letters.joined().uppercased()
    }

    /// True for light colours (white/gold) so the code switches to dark text.
    static func isLight(_ hex: String?) -> Bool {
        guard let hex, let value = UInt32(hex.replacingOccurrences(of: "#", with: ""), radix: 16) else {
            return false
        }
        let red = Double((value >> 16) & 0xFF) / Self.byteMax
        let green = Double((value >> 8) & 0xFF) / Self.byteMax
        let blue = Double(value & 0xFF) / Self.byteMax
        let luma = Self.lumaRed * red + Self.lumaGreen * green + Self.lumaBlue * blue
        return luma > Self.lightThreshold
    }

    private static let palette: [Color] = [.blue, .red, .green, .orange, .purple, .teal, .indigo, .pink, .brown]

    static func color(for name: String) -> Color {
        let sum = name.unicodeScalars.reduce(0) { $0 &+ Int($1.value) }
        return palette[abs(sum) % palette.count]
    }
}
