import SwiftUI

struct ContentView: View {
    @Environment(APIClient.self) private var api
    @Environment(NetworkMonitor.self) private var network
    @State private var selectedTab: AppTab = .today
    @State private var showSettings = false

    var body: some View {
        if api.isConfigured {
            TabView(selection: $selectedTab) {
                Tab("Today", systemImage: "waveform.path.ecg", value: AppTab.today) {
                    TodayView(
                        onShowSettings: { showSettings = true },
                        onShowIssues: { selectedTab = .issues },
                        onShowPullRequests: { selectedTab = .pullRequests },
                        onShowSessions: { selectedTab = .active }
                    )
                }
                .accessibilityIdentifier("today-tab")
                Tab("Issues", systemImage: "list.bullet", value: AppTab.issues) {
                    IssueListView()
                }
                .accessibilityIdentifier("issues-tab")
                Tab("PRs", systemImage: "arrow.triangle.merge", value: AppTab.pullRequests) {
                    PRListView()
                }
                .accessibilityIdentifier("prs-tab")
                Tab("Active", systemImage: "terminal", value: AppTab.active) {
                    SessionListView()
                }
                .accessibilityIdentifier("active-tab")
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
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

private enum AppTab: Hashable {
    case today
    case issues
    case pullRequests
    case active
}
