import SwiftUI

@main
struct IssueCTLApp: App {
    @State private var apiClient = APIClient()
    @State private var networkMonitor = NetworkMonitor()
    @State private var notificationSettings = NotificationSettingsStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(apiClient)
                .environment(networkMonitor)
                .environment(notificationSettings)
        }
    }
}
