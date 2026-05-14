import SwiftUI

struct MacSidebarRootView: View {
    @Environment(APIClient.self) private var api
    @Environment(SidebarChromeState.self) private var chrome
    @Environment(MacSidebarPreferences.self) private var preferences
    @Environment(MacSidebarDisplayPreferences.self) private var displayPreferences
    @Environment(\.hideSidebar) private var hideSidebar
    @Environment(\.toggleSidebarCollapsed) private var toggleSidebarCollapsed

    let store: MacSidebarStore
    @Bindable var issueFilterState: MacIssueFilterState

    @State private var selectedSection: MacSidebarSection = .issues
    @State private var serverURL = "http://localhost:3847"
    @State private var apiToken = ""
    @State private var isCheckingConnection = false
    @State private var isAutoConnecting = false
    @State private var hasAttemptedAutoConnect = false
    @State private var connectionError: String?

    var body: some View {
        Group {
            if chrome.isCollapsed {
                collapsedRail
            } else {
                expandedSidebar
            }
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
            Text("IssueCTL")
                .font(.headline)
            Spacer()
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
                Button {
                    api.disconnect()
                    store.reset()
                    hasAttemptedAutoConnect = true
                } label: {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Disconnect")
                .help("Disconnect")
                .accessibilityIdentifier("mac-sidebar-disconnect-button")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
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
                    Image(systemName: section.systemImage)
                        .frame(width: 36, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .background(
                    RoundedRectangle(cornerRadius: 7)
                        .fill(selectedSection == section ? Color.accentColor.opacity(0.16) : Color.clear)
                )
                .help(section.title)
            }

            Divider()

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

    private var dashboard: some View {
        VStack(spacing: 0) {
            dashboardToolbar
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

            Divider()

            Group {
                switch selectedSection {
                case .issues:
                    MacIssuesView(store: store, filterState: issueFilterState)
                case .drafts:
                    MacDraftsView(store: store)
                case .active:
                    MacSessionsView(store: store)
                }
            }
        }
        .task {
            await store.load(api: api, refresh: false)
        }
    }

    private var dashboardToolbar: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(selectedSection.title)
                    .font(.headline)
                Text(store.summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
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
            .help("Refresh")
        }
        .padding(14)
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
    case issues
    case drafts
    case active

    var id: String { rawValue }

    var title: String {
        switch self {
        case .issues: "Issues"
        case .drafts: "Drafts"
        case .active: "Active"
        }
    }

    var systemImage: String {
        switch self {
        case .issues: "list.bullet"
        case .drafts: "doc.text"
        case .active: "terminal"
        }
    }
}
