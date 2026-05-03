import SwiftUI

@main
struct IssueCTLApp: App {
    @State private var apiClient = APIClient()
    @State private var networkMonitor = NetworkMonitor()

    init() {
        PerformanceTrace.markAppLaunchStarted()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(apiClient)
                .environment(networkMonitor)
        }
    }
}
