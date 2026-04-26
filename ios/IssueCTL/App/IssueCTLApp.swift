import SwiftUI

@main
struct IssueCTLApp: App {
    @State private var apiClient = APIClient()
    @State private var networkMonitor = NetworkMonitor()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(apiClient)
                .environment(networkMonitor)
        }
    }
}
