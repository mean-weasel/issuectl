import SwiftUI

struct MacSidebarRootView: View {
    @Environment(APIClient.self) private var api
    @Environment(NetworkMonitor.self) private var network
    @Environment(SidebarChromeState.self) private var chrome
    @Environment(MacSidebarPreferences.self) private var preferences
    @Environment(MacSidebarDisplayPreferences.self) private var displayPreferences
    @Environment(\.hideSidebar) private var hideSidebar
    @Environment(\.toggleSidebarCollapsed) private var toggleSidebarCollapsed

    let store: MacSidebarStore
    @Bindable var issueFilterState: MacIssueFilterState
    @Bindable var pullRequestFilterState: MacPullRequestFilterState
    @Bindable var sessionFilterState: MacSessionFilterState

    @State private var selectedSection: MacSidebarSection = .issues
    @State private var serverURL = "http://localhost:3847"
    @State private var apiToken = ""
    @State private var isCheckingConnection = false
    @State private var isAutoConnecting = false
    @State private var hasAttemptedAutoConnect = false
    @State private var connectionError: String?
    @State private var isShowingDisconnectConfirmation = false

    var body: some View {
        Group {
            if chrome.isCollapsed {
                collapsedRail
            } else {
                expandedSidebar
            }
        }
        .confirmationDialog("Disconnect IssueCTL?", isPresented: $isShowingDisconnectConfirmation, titleVisibility: .visible) {
            Button("Disconnect", role: .destructive) {
                disconnect()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes the saved connection from the Mac app. Local drafts remain on this Mac.")
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .onExitCommand {
            hideSidebar()
        }
        .environment(\.macSidebarTextScale, preferences.textScale)
        .onAppear {
            selectedSection = MacSidebarSection(rawValue: displayPreferences.selectedSectionRawValue) ?? .issues
        }
        .task {
            await autoConnectIfAvailable()
        }
        .onChange(of: selectedSection) { _, newValue in
            displayPreferences.selectedSectionRawValue = newValue.rawValue
        }
        .onChange(of: displayPreferences.selectedSectionRawValue) { _, newValue in
            selectedSection = MacSidebarSection(rawValue: newValue) ?? .issues
        }
    }

    private var expandedSidebar: some View {
        VStack(spacing: 0) {
            header
            Divider()

            if api.isConfigured {
                dashboard
            } else {
                connectionView
            }
        }
        .frame(minWidth: 340, idealWidth: 380, minHeight: 480)
    }

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "list.bullet.rectangle")
                .font(.title3.weight(.semibold))
            VStack(alignment: .leading, spacing: 2) {
                Text("IssueCTL")
                    .font(.headline)
                if api.isConfigured {
                    Text(store.summary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .accessibilityIdentifier("mac-sidebar-global-summary")
                }
            }
            Spacer()
            if api.isConfigured {
                Button {
                    Task { await store.load(api: api, refresh: true) }
                } label: {
                    if store.isLoading {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .buttonStyle(.borderless)
                .disabled(store.isLoading)
                .accessibilityLabel("Refresh Sidebar")
                .help("Refresh Sidebar")
                .accessibilityIdentifier("mac-sidebar-refresh-button")
            }

            Button {
                toggleSidebarCollapsed()
            } label: {
                Image(systemName: "sidebar.right")
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Collapse Sidebar")
            .help("Collapse Sidebar")
            .accessibilityIdentifier("mac-sidebar-collapse-button")

            Button {
                hideSidebar()
            } label: {
                Image(systemName: "xmark")
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Hide Sidebar")
            .help("Hide Sidebar")
            .accessibilityIdentifier("mac-sidebar-hide-button")

            if api.isConfigured {
                Menu {
                    Button {
                        isShowingDisconnectConfirmation = true
                    } label: {
                        Label("Disconnect...", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                    .accessibilityIdentifier("mac-sidebar-disconnect-menu-item")
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .menuStyle(.borderlessButton)
                .accessibilityLabel("More Sidebar Actions")
                .help("More Sidebar Actions")
                .accessibilityIdentifier("mac-sidebar-more-actions-menu")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private func disconnect() {
        api.disconnect()
        store.reset()
        hasAttemptedAutoConnect = true
    }

    private var collapsedRail: some View {
        VStack(spacing: 12) {
            Image(systemName: "list.bullet.rectangle")
                .font(.title3.weight(.semibold))
                .padding(.top, 12)

            Button {
                toggleSidebarCollapsed()
            } label: {
                VStack(spacing: 3) {
                    Image(systemName: "sidebar.leading")
                        .font(.system(size: 17, weight: .semibold))
                    Text("Expand")
                        .font(.caption2.weight(.semibold))
                }
                .frame(width: 60, height: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .accessibilityLabel("Expand Sidebar")
            .help("Expand Sidebar")
            .accessibilityIdentifier("mac-sidebar-expand-button")

            Divider()

            ForEach(MacSidebarSection.allCases) { section in
                Button {
                    selectedSection = section
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: section.systemImage)
                            .frame(width: 36, height: 32)
                            .contentShape(Rectangle())

                        if let count = collapsedRailCount(for: section), count > 0 {
                            Text(collapsedRailBadgeText(count))
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 4)
                                .frame(minWidth: 14, minHeight: 14)
                                .background(Color.accentColor, in: Capsule())
                                .offset(x: 5, y: -3)
                                .accessibilityHidden(true)
                        }
                    }
                }
                .buttonStyle(.borderless)
                .background(
                    RoundedRectangle(cornerRadius: 7)
                        .fill(selectedSection == section ? Color.accentColor.opacity(0.16) : Color.clear)
                )
                .help(section.title)
                .accessibilityLabel(section.title)
                .accessibilityValue(collapsedRailAccessibilityValue(for: section))
                .accessibilityIdentifier("mac-sidebar-section-\(section.rawValue)")
            }

            Divider()

            if !network.isConnected {
                Image(systemName: "wifi.slash")
                    .foregroundStyle(.orange)
                    .frame(width: 36, height: 24)
                    .help("Offline")
                    .accessibilityLabel("Offline")
                    .accessibilityIdentifier("mac-sidebar-collapsed-offline-indicator")
            }

            Button {
                Task { await store.load(api: api, refresh: true) }
            } label: {
                if store.isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .frame(width: 36, height: 32)
                } else {
                    Image(systemName: "arrow.clockwise")
                        .frame(width: 36, height: 32)
                }
            }
            .buttonStyle(.borderless)
            .disabled(!api.isConfigured || store.isLoading)
            .help("Refresh")

            Spacer()

            Button {
                hideSidebar()
            } label: {
                Image(systemName: "xmark")
                    .frame(width: 36, height: 32)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Hide Sidebar")
            .help("Hide Sidebar")
            .accessibilityIdentifier("mac-sidebar-collapsed-hide-button")
            .padding(.bottom, 12)
        }
        .frame(width: 76)
        .frame(minHeight: 480)
        .task {
            if api.isConfigured {
                await store.load(api: api, refresh: false)
            }
        }
    }

    private func collapsedRailCount(for section: MacSidebarSection) -> Int? {
        switch section {
        case .today:
            let attentionCount = store.sessions.count + store.drafts.count
            return attentionCount > 0 ? attentionCount : nil
        case .issues:
            return store.issues.count
        case .pullRequests:
            return nil
        case .drafts:
            return store.drafts.count
        case .active:
            return store.sessions.count
        }
    }

    private func collapsedRailBadgeText(_ count: Int) -> String {
        count > 99 ? "99+" : "\(count)"
    }

    private func collapsedRailAccessibilityValue(for section: MacSidebarSection) -> String {
        var parts: [String] = []
        if selectedSection == section {
            parts.append("Selected")
        }
        if let count = collapsedRailCount(for: section) {
            parts.append("\(count) item\(count == 1 ? "" : "s")")
        }
        if !network.isConnected {
            parts.append("Offline")
        }
        return parts.joined(separator: ", ")
    }

    private var dashboard: some View {
        VStack(spacing: 0) {
            if !network.isConnected {
                offlineBanner
            }
            if let errorMessage = store.errorMessage {
                MacRecoveryBanner(
                    message: errorMessage,
                    actionTitle: "Retry",
                    isActionDisabled: store.isLoading
                ) {
                    Task { await store.load(api: api, refresh: true) }
                }
            }
            Picker("Section", selection: $selectedSection) {
                ForEach(MacSidebarSection.allCases) { section in
                    Label(section.title, systemImage: section.systemImage)
                        .tag(section)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(.horizontal, 14)
            .padding(.bottom, 10)
            .accessibilityIdentifier("mac-sidebar-section-picker")

            Divider()

            Group {
                switch selectedSection {
                case .today:
                    MacTodayView(store: store)
                case .issues:
                    MacIssuesView(store: store, filterState: issueFilterState)
                case .pullRequests:
                    MacPullRequestsView(store: store, filterState: pullRequestFilterState)
                case .drafts:
                    MacDraftsView(store: store)
                case .active:
                    MacSessionsView(store: store, filterState: sessionFilterState)
                }
            }
        }
        .task {
            await store.load(api: api, refresh: false)
        }
    }

    private var offlineBanner: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Label("Offline - showing cached data when available", systemImage: "wifi.slash")
                .font(.caption)
                .foregroundStyle(.orange)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 8))
        .padding(.horizontal, 14)
        .padding(.bottom, 10)
        .accessibilityIdentifier("mac-sidebar-offline-banner")
    }

    private var connectionView: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(isAutoConnecting ? "Connecting to local issuectl web" : "Connect to issuectl web")
                    .font(.title3.weight(.semibold))
                Text(connectionHelpText)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if isAutoConnecting {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Using the local server token from ~/.issuectl/issuectl.db")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            TextField("Server URL", text: $serverURL)
                .textFieldStyle(.roundedBorder)

            SecureField("API token", text: $apiToken)
                .textFieldStyle(.roundedBorder)

            if let connectionError {
                Text(connectionError)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button {
                Task { await connect() }
            } label: {
                if isCheckingConnection || isAutoConnecting {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Label(connectionError == nil ? "Connect" : "Retry Connect", systemImage: "bolt.horizontal.circle")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isCheckingConnection || isAutoConnecting || serverURL.isEmpty || apiToken.isEmpty)

            Spacer()
        }
        .padding(18)
    }

    private var connectionHelpText: String {
        if isAutoConnecting {
            return "The mac sidebar runs on the same Mac as `issuectl web`, so it can connect automatically."
        }
        return "Start `issuectl web`; the sidebar will try localhost automatically. You can still enter a URL and token manually."
    }

    private func autoConnectIfAvailable() async {
        guard !api.isConfigured, !hasAttemptedAutoConnect, !isAutoConnecting else { return }

        hasAttemptedAutoConnect = true
        isAutoConnecting = true
        connectionError = nil
        defer { isAutoConnecting = false }

        let localConnection = LocalIssueCTLConnection()

        do {
            guard let token = try localConnection.apiToken() else { return }
            _ = try await api.checkHealth(url: localConnection.serverURL, token: token)
            try api.configure(url: localConnection.serverURL, token: token)
            serverURL = localConnection.serverURL
            apiToken = token
            await store.load(api: api, refresh: true)
        } catch {
            connectionError = "Could not auto-connect to local issuectl web: \(error.localizedDescription)"
        }
    }

    private func connect() async {
        isCheckingConnection = true
        connectionError = nil
        defer { isCheckingConnection = false }

        do {
            _ = try await api.checkHealth(url: serverURL, token: apiToken)
            try api.configure(url: serverURL, token: apiToken)
            await store.load(api: api, refresh: true)
        } catch {
            connectionError = error.localizedDescription
        }
    }
}

private enum MacSidebarSection: String, CaseIterable, Identifiable {
    case today
    case issues
    case pullRequests
    case drafts
    case active

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: "Today"
        case .issues: "Issues"
        case .pullRequests: "PRs"
        case .drafts: "Drafts"
        case .active: "Active"
        }
    }

    var systemImage: String {
        switch self {
        case .today: "smallcircle.filled.circle"
        case .issues: "list.bullet"
        case .pullRequests: "arrow.triangle.merge"
        case .drafts: "doc.text"
        case .active: "terminal"
        }
    }
}
