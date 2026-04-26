import Foundation
import Network

/// Monitors network connectivity using NWPathMonitor.
///
/// Usage: inject as an environment object or create in the app entry point.
///
/// ```swift
/// @State private var networkMonitor = NetworkMonitor()
///
/// ContentView()
///     .environment(networkMonitor)
/// ```
///
/// Then in any view:
///
/// ```swift
/// @Environment(NetworkMonitor.self) private var network
///
/// if !network.isConnected {
///     Text("Offline")
/// }
/// ```
@Observable @MainActor
final class NetworkMonitor {
    private(set) var isConnected: Bool = true
    private(set) var connectionType: ConnectionType = .unknown

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.issuectl.network-monitor")

    enum ConnectionType: Sendable {
        case wifi
        case cellular
        case wiredEthernet
        case other
        case unknown
    }

    init() {
        startMonitoring()
    }

    deinit {
        monitor.cancel()
    }

    private func startMonitoring() {
        monitor.pathUpdateHandler = { [weak self] path in
            let connected = path.status == .satisfied
            let type = resolveConnectionType(from: path)
            Task { @MainActor [weak self] in
                self?.isConnected = connected
                self?.connectionType = type
            }
        }
        monitor.start(queue: queue)
    }
}

/// Resolve NWPath to a ConnectionType outside the @MainActor class
/// so it can be called from the non-isolated pathUpdateHandler closure.
private func resolveConnectionType(from path: NWPath) -> NetworkMonitor.ConnectionType {
    if path.usesInterfaceType(.wifi) {
        return .wifi
    } else if path.usesInterfaceType(.cellular) {
        return .cellular
    } else if path.usesInterfaceType(.wiredEthernet) {
        return .wiredEthernet
    } else if path.status == .satisfied {
        return .other
    }
    return .unknown
}
