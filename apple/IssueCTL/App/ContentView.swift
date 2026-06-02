import SwiftUI
import UIKit

struct ContentView: View {
    @Environment(APIClient.self) private var api
    @Environment(NetworkMonitor.self) private var network
    @Environment(NotificationSettingsStore.self) private var notificationSettings
    @Environment(OfflineSyncService.self) private var offlineSync
    @State private var selectedTab: AppTab = .today
    @State private var showSettings = false
    @State private var pendingRoute: AppRoute?
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
                    Tab("Board", systemImage: "rectangle.grid.2x2", value: AppTab.board) {
                        BoardView(
                            onShowSettings: { showSettings = true },
                            route: $pendingRoute
                        )
                            .ignoresSafeArea(.container, edges: .bottom)
                    }
                    .accessibilityIdentifier("board-tab")
                    Tab("Issues", systemImage: "list.bullet", value: AppTab.issues) {
                        IssueListView(
                            onShowSettings: { showSettings = true },
                            route: $pendingRoute
                        )
                            .ignoresSafeArea(.container, edges: .bottom)
                    }
                    .accessibilityIdentifier("issues-tab")
                    Tab("PRs", systemImage: "arrow.triangle.merge", value: AppTab.pullRequests) {
                        PRListView(
                            onShowSettings: { showSettings = true },
                            route: $pendingRoute
                        )
                            .ignoresSafeArea(.container, edges: .bottom)
                    }
                    .accessibilityIdentifier("prs-tab")
                    Tab("Active", systemImage: "terminal", value: AppTab.active) {
                        SessionListView(
                            onShowSettings: { showSettings = true },
                            onShowIssues: { selectedTab = .issues },
                            route: $pendingRoute
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
                .overlay(alignment: .bottom) {
                    if shouldShowStatusBanners {
                        statusBanners
                    }
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
            if let setup = SetupLink(url: url) {
                try? api.configure(url: setup.serverURL, token: setup.token)
                Task { await notificationSettings.syncRegistration(apiClient: api) }
                return
            }
            guard let route = AppRoute(url: url) else { return }
            handle(route)
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
        .onReceive(NotificationCenter.default.publisher(for: .notificationResponseReceived)) { notification in
            guard let route = AppRoute(notificationUserInfo: notification.userInfo ?? [:]) else { return }
            handle(route)
        }
    }

    private var shouldShowStatusBanners: Bool {
        !network.isConnected || rootOfflineQueueBannerState != nil
    }

    private var rootOfflineQueueBannerState: RootOfflineQueueBannerState? {
        makeRootOfflineQueueBannerState(
            pendingCount: offlineSync.pendingCount,
            failedCount: offlineSync.failedCount,
            isSyncing: offlineSync.isSyncing,
            isNetworkConnected: network.isConnected
        )
    }

    private var statusBanners: some View {
        VStack(spacing: 8) {
            OfflineBanner()
            if let rootOfflineQueueBannerState {
                OfflineQueueBanner(
                    pendingCount: rootOfflineQueueBannerState.pendingCount,
                    failedCount: rootOfflineQueueBannerState.failedCount,
                    isSyncing: rootOfflineQueueBannerState.isSyncing,
                    onSync: {
                        offlineSync.retryFailedActions()
                        await offlineSync.syncPendingActions()
                    },
                    onDismissFailed: {
                        offlineSync.clearFailedActions()
                    }
                )
            }
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 92)
        .background(.clear)
    }

    private func handle(_ route: AppRoute) {
        switch route {
        case .issue:
            selectedTab = .issues
            pendingRoute = route
        case .pullRequest:
            selectedTab = .pullRequests
            pendingRoute = route
        case .board:
            selectedTab = .board
            pendingRoute = route
        case .sessions:
            selectedTab = .active
            pendingRoute = route
        case .review:
            selectedTab = .active
            pendingRoute = route
        }
    }
}

private enum AppTab: Hashable {
    case today
    case board
    case issues
    case pullRequests
    case active
}

struct RootOfflineQueueBannerState: Equatable {
    let pendingCount: Int
    let failedCount: Int
    let isSyncing: Bool
}

func makeRootOfflineQueueBannerState(
    pendingCount: Int,
    failedCount: Int,
    isSyncing: Bool,
    isNetworkConnected: Bool
) -> RootOfflineQueueBannerState? {
    let pendingCount = max(0, pendingCount)
    let failedCount = max(0, failedCount)

    if pendingCount > 0 || isSyncing {
        return RootOfflineQueueBannerState(
            pendingCount: pendingCount,
            failedCount: failedCount,
            isSyncing: isSyncing
        )
    }

    if failedCount > 0 && !isNetworkConnected {
        return RootOfflineQueueBannerState(
            pendingCount: pendingCount,
            failedCount: failedCount,
            isSyncing: isSyncing
        )
    }

    return nil
}
