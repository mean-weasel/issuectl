import SwiftUI
import UIKit

struct ContentView: View {
    @Environment(APIClient.self) private var api
    @Environment(NetworkMonitor.self) private var network
    @Environment(NotificationSettingsStore.self) private var notificationSettings
    @Environment(OfflineSyncService.self) private var offlineSync
    @State private var selectedTab: AppTab = .today
    @State private var showSettings = false
    private let launchNotificationSyncDelay: Duration = .seconds(1)

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
                    VStack(spacing: 8) {
                        OfflineBanner()
                        OfflineQueueBanner(
                            pendingCount: offlineSync.pendingCount,
                            failedCount: offlineSync.failedCount,
                            isSyncing: offlineSync.isSyncing,
                            onSync: {
                                offlineSync.retryFailedActions()
                                await offlineSync.syncPendingActions()
                            },
                            onDismissFailed: {
                                offlineSync.clearFailedActions()
                            }
                        )
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                }
                .animation(.easeInOut(duration: 0.3), value: network.isConnected)
                .animation(.easeInOut(duration: 0.25), value: offlineSync.pendingCount)
                .animation(.easeInOut(duration: 0.25), value: offlineSync.failedCount)
            } else {
                OnboardingView()
            }
        }
        .onChange(of: network.isConnected) { _, isConnected in
            guard isConnected else { return }
            Task { await offlineSync.syncPendingActions() }
        }
        .onOpenURL { url in
            guard let setup = SetupLink(url: url) else { return }
            try? api.configure(url: setup.serverURL, token: setup.token)
            Task { await notificationSettings.syncRegistration(apiClient: api) }
        }
        .task {
            try? await Task.sleep(for: launchNotificationSyncDelay)
            await notificationSettings.registerForRemoteNotificationsIfAllowed()
            await notificationSettings.syncRegistration(apiClient: api)
        }
        .onReceive(NotificationCenter.default.publisher(for: .apnsDeviceTokenReceived)) { notification in
            if let error = notification.userInfo?["error"] as? String {
                notificationSettings.updateRegistrationError(error)
                return
            }
            guard let token = notification.userInfo?["token"] as? String else { return }
            notificationSettings.updateDeviceToken(token)
            Task { await notificationSettings.syncRegistration(apiClient: api) }
        }
    }
}

private enum AppTab: Hashable {
    case today
    case issues
    case pullRequests
    case active
}
