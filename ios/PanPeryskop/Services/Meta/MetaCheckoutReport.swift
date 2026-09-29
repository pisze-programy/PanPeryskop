import FBSDKCoreKit
import Foundation
import UIKit

@MainActor
enum MetaCheckoutReport {
    static func send(eventId: String, kind: ContentKind, id: String, label: String, trackingEnabled: Bool) {
        Task { await post(eventId: eventId, kind: kind, id: id, label: label, trackingEnabled: trackingEnabled) }
    }

    private static func post(eventId: String, kind: ContentKind, id: String, label: String, trackingEnabled: Bool) async {
        guard let url = URL(string: "\(APIClient.baseURL)/meta/checkout") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(clientToken, forHTTPHeaderField: "x-pp-client")
        request.httpBody = try? JSONEncoder().encode(Payload(
            eventId: eventId,
            kind: kind.rawValue,
            contentId: id,
            label: label,
            anonId: anonID,
            trackingEnabled: trackingEnabled ? 1 : 0,
            extinfo: extinfo
        ))
        _ = try? await URLSession.shared.data(for: request)
    }

    private static var anonID: String {
        let sdk = AppEvents.shared.anonymousID ?? ""
        return sdk.isEmpty ? InstallID.value : sdk
    }

    private static var clientToken: String {
        Bundle.main.object(forInfoDictionaryKey: "FacebookClientToken") as? String ?? ""
    }

    private struct Payload: Encodable {
        let eventId: String
        let kind: String
        let contentId: String
        let label: String
        let anonId: String
        let trackingEnabled: Int
        let extinfo: [String]

        enum CodingKeys: String, CodingKey {
            case kind
            case label
            case extinfo
            case contentId = "content_id"
            case eventId = "event_id"
            case anonId = "anon_id"
            case trackingEnabled = "tracking_enabled"
        }
    }

    private static var extinfo: [String] {
        [
            "i2",
            Bundle.main.bundleIdentifier ?? "",
            Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
            Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "",
            UIDevice.current.systemVersion,
            machine,
            Locale.current.identifier,
            TimeZone.current.abbreviation() ?? "",
            "",
            String(Int(UIScreen.main.nativeBounds.width)),
            String(Int(UIScreen.main.nativeBounds.height)),
            String(Int(UIScreen.main.scale)),
            String(ProcessInfo.processInfo.processorCount),
            gigabytes(totalSpace),
            gigabytes(freeSpace),
            TimeZone.current.identifier
        ]
    }

    private static var machine: String {
        var names = utsname()
        uname(&names)
        let pointer = withUnsafePointer(to: &names.machine) {
            UnsafeRawPointer($0).assumingMemoryBound(to: CChar.self)
        }
        return String(cString: pointer)
    }

    private static var fileSystem: [FileAttributeKey: Any]? {
        try? FileManager.default.attributesOfFileSystem(forPath: NSHomeDirectory())
    }

    private static var totalSpace: Int64? {
        fileSystem?[.systemSize] as? Int64
    }

    private static var freeSpace: Int64? {
        fileSystem?[.systemFreeSize] as? Int64
    }

    private static func gigabytes(_ bytes: Int64?) -> String {
        guard let bytes else { return "" }
        return String(Int(Double(bytes) / 1_073_741_824))
    }
}
