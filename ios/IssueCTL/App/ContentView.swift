import SwiftUI
import UIKit

struct ContentView: View {
    @Environment(APIClient.self) private var api
    @Environment(NetworkMonitor.self) private var network
    @State private var selectedTab: AppTab = .today
    @State private var showSettings = false

    init() {
        let appearance = UITabBarAppearance()
        appearance.configureWithDefaultBackground()
        appearance.backgroundEffect = UIBlurEffect(style: .systemChromeMaterial)
        appearance.backgroundColor = UIColor.systemGroupedBackground.withAlphaComponent(0.72)
        appearance.shadowColor = .clear
        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }

    var body: some View {
        Group {
            if api.isConfigured {
                TabView(selection: $selectedTab) {
                    Tab("Today", systemImage: "waveform.path.ecg", value: AppTab.today) {
                        TodayView(
                            onShowSettings: { showSettings = true },
                            onShowIssues: { selectedTab = .issues },
                            onShowPullRequests: { selectedTab = .pullRequests },
                            onShowSessions: { selectedTab = .active }
                        )
                        .ignoresSafeArea(.container, edges: .bottom)
                    }
                    .accessibilityIdentifier("today-tab")
                    Tab("Issues", systemImage: "list.bullet", value: AppTab.issues) {
                        IssueListView(onShowSettings: { showSettings = true })
                            .ignoresSafeArea(.container, edges: .bottom)
                    }
                    .accessibilityIdentifier("issues-tab")
                    Tab("PRs", systemImage: "arrow.triangle.merge", value: AppTab.pullRequests) {
                        PRListView(onShowSettings: { showSettings = true })
                            .ignoresSafeArea(.container, edges: .bottom)
                    }
                    .accessibilityIdentifier("prs-tab")
                    Tab("Active", systemImage: "terminal", value: AppTab.active) {
                        SessionListView(
                            onShowSettings: { showSettings = true },
                            onShowIssues: { selectedTab = .issues }
                        )
                            .ignoresSafeArea(.container, edges: .bottom)
                    }
                    .accessibilityIdentifier("active-tab")
                }
                .toolbarBackground(IssueCTLColors.appBackground, for: .tabBar)
                .toolbarBackground(.visible, for: .tabBar)
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
        .onOpenURL { url in
            guard let setup = SetupLink(url: url) else { return }
            try? api.configure(url: setup.serverURL, token: setup.token)
        }
    }
}

private enum AppTab: Hashable {
    case today
    case issues
    case pullRequests
    case active
}
