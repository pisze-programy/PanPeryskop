import Foundation
import Network

/// Simple reachability wrapper used to gate background-upload retries.
final class NetworkMonitor: @unchecked Sendable {
    static let shared = NetworkMonitor()

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "PanPeryskop.NetworkMonitor")
    private let lock = NSLock()
    private var _isReachable = true

    var isReachable: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isReachable
    }

    var onStatusChange: ((Bool) -> Void)?

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let reachable = path.status == .satisfied
            guard let self else { return }
            self.lock.lock()
            self._isReachable = reachable
            self.lock.unlock()
            self.onStatusChange?(reachable)
        }
        monitor.start(queue: queue)
    }
}
