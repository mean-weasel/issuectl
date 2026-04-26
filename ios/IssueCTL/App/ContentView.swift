import SwiftUI

struct ContentView: View {
    @Environment(APIClient.self) private var api
    @Environment(NetworkMonitor.self) private var network

    var body: some View {
        if api.isConfigured {
            TabView {
                Tab("Issues", systemImage: "list.bullet") {
                    IssueListView()
                }
                Tab("PRs", systemImage: "arrow.triangle.merge") {
                    PRListView()
                }
                Tab("Active", systemImage: "play.circle") {
                    SessionListView()
                }
                Tab("Settings", systemImage: "gearshape") {
                    SettingsView()
                }
            }
            .overlay(alignment: .top) {
                OfflineBanner()
            }
            .animation(.easeInOut(duration: 0.3), value: network.isConnected)
        } else {
            OnboardingView()
        }
    }
}
