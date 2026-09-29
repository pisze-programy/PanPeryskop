import AppTrackingTransparency
import FBSDKCoreKit
import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        Settings.shared.isAutoLogAppEventsEnabled = ATTrackingManager.trackingAuthorizationStatus != .notDetermined
        ApplicationDelegate.shared.application(application, didFinishLaunchingWithOptions: launchOptions)
        return true
    }
}
