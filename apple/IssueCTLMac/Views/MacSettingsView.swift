import AppKit
import SwiftUI

struct MacSettingsView: View {
    @Environment(APIClient.self) private var api
    @Environment(MacSidebarPreferences.self) private var preferences
    @Environment(SpaceSidebarCoordinator.self) private var sidebarCoordinator
    @Environment(\.resetSidebarLayout) private var resetSidebarLayout
    @State private var isUpdatingLaunchAtLogin = false
    @State private var repos: [Repo] = []
    @State private var serverHealth: ServerHealth?
    @State private var currentUsername: String?
    @State private var isLoadingConnection = false
    @State private var connectionError: String?
    @State private var showConnectionEditor = false
    @State private var manualServerURL = ""
    @State private var manualAPIToken = ""
    @State private var isSavingConnection = false
    @State private var connectionSaveError: String?
    @State private var isReconnectingLocal = false
    @State private var isLoadingRepos = false
    @State private var repoError: String?
    @State private var settings: [String: String] = [:]
    @State private var isLoadingSettings = false
    @State private var settingsError: String?
    @State private var isSavingSettings = false
    @State private var settingsSaveError: String?
    @State private var showSettingsSaved = false
    @State private var cacheTTL = ""
    @State private var launchAgent: LaunchAgent = .claude
    @State private var claudeExtraArgs = ""
    @State private var codexExtraArgs = ""
    @State private var idleGracePeriod = ""
    @State private var idleThreshold = ""
    @State private var branchPattern = ""
    @State private var worktreeDir = ""
    @State private var defaultRepoId = ""
    @State private var worktrees: [WorktreeInfo] = []
    @State private var isLoadingWorktrees = false
    @State private var worktreeError: String?
    @State private var worktreeActionError: String?
    @State private var isCleaningStaleWorktrees = false
    @State private var cleaningWorktreePath: String?
    @State private var showAddRepo = false
    @State private var editingRepo: Repo?
    @State private var repoPendingRemoval: Repo?
    @State private var removingRepoFullName: String?

    var body: some View {
        Form {
            connectionSection

            advancedSettingsSection

            worktreesSection

            Section("Mac Sidebar") {
                Toggle("Launch at Login", isOn: launchAtLoginBinding)
                    .disabled(isUpdatingLaunchAtLogin)

                if isUpdatingLaunchAtLogin {
                    ProgressView()
                        .controlSize(.small)
                }

                if let error = preferences.launchAtLoginError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Text Size")
                        Spacer()
                        Text("\(Int(preferences.textScale * 100))%")
                            .foregroundStyle(.secondary)
                    }

                    Slider(
                        value: textScaleBinding,
                        in: MacSidebarPreferences.minimumTextScale...MacSidebarPreferences.maximumTextScale,
                        step: 0.05
                    )

                    HStack {
                        Text("Smaller")
                        Spacer()
                        Text("Larger")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }

            Section("Repositories") {
                HStack {
                    Button {
                        showAddRepo = true
                    } label: {
                        Label("Add Repository", systemImage: "plus")
                    }
                    .accessibilityIdentifier("mac-settings-add-repository-button")

                    Spacer()

                    Button {
                        Task { await loadRepos(refresh: true) }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                    .disabled(isLoadingRepos)
                    .accessibilityIdentifier("mac-settings-refresh-repositories-button")
                }

                if isLoadingRepos && repos.isEmpty {
                    ProgressView("Loading repositories...")
                        .accessibilityIdentifier("mac-settings-repositories-loading")
                } else if let repoError, repos.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Label(repoError, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("mac-settings-repositories-error")
                        Button("Retry") {
                            Task { await loadRepos(refresh: true) }
                        }
                    }
                } else if repos.isEmpty {
                    ContentUnavailableView(
                        "No Repositories",
                        systemImage: "folder",
                        description: Text("Add a repo to populate sidebar issue filters.")
                    )
                    .accessibilityIdentifier("mac-settings-repositories-empty")
                } else {
                    ForEach(repos) { repo in
                        MacSettingsRepoRow(
                            repo: repo,
                            isRemoving: removingRepoFullName == repo.fullName,
                            onEdit: { editingRepo = repo },
                            onRemove: { repoPendingRemoval = repo }
                        )
                    }
                }

                if let repoError, !repos.isEmpty {
                    Label(repoError, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                        .font(.caption)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("mac-settings-repositories-refresh-error")
                }

                Button("Open Web Settings") {
                    openWebSettings()
                }
                .accessibilityIdentifier("mac-settings-open-web-settings-button")
            }

            Section("Learned Desktops") {
                if sidebarCoordinator.spaceStates.isEmpty {
                    Text("No desktops learned yet")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(sidebarCoordinator.spaceStates, id: \.id) { spaceState in
                        spaceSettingsRow(spaceState)
                    }
                }

                Button("Reset All Desktop Sidebar Layouts") {
                    resetSidebarLayout()
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 500)
        .frame(minHeight: 640)
        .padding()
        .accessibilityIdentifier("mac-settings-view")
        .sheet(isPresented: $showAddRepo) {
            MacAddRepoSheet(trackedRepos: repos) { repo in
                upsertRepo(repo)
                await refreshSidebarAfterRepoMutation()
            }
            .environment(api)
        }
        .sheet(item: $editingRepo) { repo in
            MacEditRepoSheet(repo: repo) { updated in
                upsertRepo(updated)
                await refreshSidebarAfterRepoMutation()
            }
            .environment(api)
        }
        .confirmationDialog(
            "Remove repository?",
            isPresented: Binding(
                get: { repoPendingRemoval != nil },
                set: { if !$0 { repoPendingRemoval = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let repo = repoPendingRemoval {
                Button("Remove \(repo.fullName)", role: .destructive) {
                    Task { await remove(repo) }
                }
            }
            Button("Cancel", role: .cancel) {
                repoPendingRemoval = nil
            }
        } message: {
            if let repo = repoPendingRemoval {
                Text("This removes \(repo.fullName) from tracked repositories and sidebar filters.")
            }
        }
        .task {
            preferences.refreshLaunchAtLoginStatus()
            syncManualConnectionFields()
            await loadSettingsData()
        }
    }

    private var connectionSection: some View {
        Section("Connection") {
            MacConnectionStatusCard(
                serverURL: api.serverURL,
                username: currentUsername,
                repoCount: repos.count,
                serverVersion: serverHealth?.version,
                appVersion: MacSettingsAppVersion.display,
                tokenSaved: !api.apiToken.isEmpty,
                error: connectionError,
                isLoading: isLoadingConnection
            ) {
                Task { await loadConnectionStatus() }
            }

            HStack {
                Button {
                    showConnectionEditor.toggle()
                } label: {
                    Label(showConnectionEditor ? "Hide Connection Editor" : "Edit Connection", systemImage: "pencil")
                }
                .accessibilityIdentifier("mac-settings-edit-connection-button")

                Button {
                    Task { await reconnectFromLocalServer() }
                } label: {
                    if isReconnectingLocal {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label("Reconnect Local", systemImage: "bolt.horizontal")
                    }
                }
                .disabled(isReconnectingLocal)
                .accessibilityIdentifier("mac-settings-reconnect-local-button")

                Spacer()

                Button("Disconnect", role: .destructive) {
                    disconnect()
                }
                .disabled(!api.isConfigured)
                .accessibilityIdentifier("mac-settings-disconnect-button")
            }

            if showConnectionEditor {
                VStack(alignment: .leading, spacing: 10) {
                    TextField("Server URL", text: $manualServerURL)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("mac-settings-server-url-field")

                    SecureField("API Token", text: $manualAPIToken)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("mac-settings-api-token-field")

                    HStack {
                        Button {
                            Task { await saveManualConnection() }
                        } label: {
                            if isSavingConnection {
                                ProgressView()
                                    .controlSize(.small)
                            } else {
                                Label("Save Connection", systemImage: "checkmark.circle")
                            }
                        }
                        .disabled(isSavingConnection || manualServerURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || manualAPIToken.isEmpty)
                        .accessibilityIdentifier("mac-settings-save-connection-button")

                        Button("Use Local Default") {
                            manualServerURL = LocalIssueCTLConnection.defaultServerURL
                        }
                    }

                    if let connectionSaveError {
                        Label(connectionSaveError, systemImage: "exclamationmark.triangle")
                            .font(.caption)
                            .foregroundStyle(.red)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("mac-settings-connection-save-error")
                    }
                }
            }
        }
    }

    private var advancedSettingsSection: some View {
        Section("Agent Harness & Defaults") {
            if isLoadingSettings {
                ProgressView("Loading settings...")
                    .accessibilityIdentifier("mac-settings-advanced-loading")
            } else if let settingsError {
                VStack(alignment: .leading, spacing: 8) {
                    Label(settingsError, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("mac-settings-advanced-error")
                    Button("Retry") {
                        Task { await loadAdvancedSettings() }
                    }
                }
            } else {
                Picker("Default Agent", selection: $launchAgent) {
                    ForEach(LaunchAgent.allCases) { agent in
                        Text(agent.displayName).tag(agent)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("mac-settings-launch-agent-picker")

                TextField("Cache TTL (seconds)", text: $cacheTTL)
                    .accessibilityIdentifier("mac-settings-cache-ttl-field")
                TextField("Worktree directory", text: $worktreeDir)
                    .accessibilityIdentifier("mac-settings-worktree-dir-field")
                TextField("Default branch pattern", text: $branchPattern)
                    .accessibilityIdentifier("mac-settings-branch-pattern-field")

                Picker("Default Repository", selection: $defaultRepoId) {
                    Text("None").tag("")
                    ForEach(repos) { repo in
                        Text(repo.fullName).tag(String(repo.id))
                    }
                }
                .accessibilityIdentifier("mac-settings-default-repo-picker")

                TextField("Claude Code extra args", text: $claudeExtraArgs)
                    .accessibilityIdentifier("mac-settings-claude-extra-args-field")
                TextField("Codex extra args", text: $codexExtraArgs)
                    .accessibilityIdentifier("mac-settings-codex-extra-args-field")

                HStack {
                    TextField("Idle grace seconds", text: $idleGracePeriod)
                        .accessibilityIdentifier("mac-settings-idle-grace-field")
                    TextField("Idle threshold seconds", text: $idleThreshold)
                        .accessibilityIdentifier("mac-settings-idle-threshold-field")
                }

                HStack {
                    Button {
                        Task { await saveAdvancedSettings() }
                    } label: {
                        if isSavingSettings {
                            ProgressView()
                                .controlSize(.small)
                        } else if showSettingsSaved {
                            Label("Saved", systemImage: "checkmark.circle.fill")
                        } else {
                            Label("Save Settings", systemImage: "square.and.arrow.down")
                        }
                    }
                    .disabled(isSavingSettings || !hasAdvancedSettingsChanges)
                    .accessibilityIdentifier("mac-settings-save-advanced-button")

                    Button {
                        applyAdvancedSettings()
                    } label: {
                        Label("Revert", systemImage: "arrow.uturn.backward")
                    }
                    .disabled(!hasAdvancedSettingsChanges)
                }

                if let settingsSaveError {
                    Label(settingsSaveError, systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("mac-settings-advanced-save-error")
                }
            }
        }
    }

    private var worktreesSection: some View {
        Section("Worktrees") {
            HStack {
                Button {
                    Task { await loadWorktrees() }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .disabled(isLoadingWorktrees)
                .accessibilityIdentifier("mac-settings-refresh-worktrees-button")

                Spacer()

                Button(role: .destructive) {
                    Task { await cleanupStaleWorktrees() }
                } label: {
                    if isCleaningStaleWorktrees {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label("Clean Up Stale", systemImage: "trash")
                    }
                }
                .disabled(staleWorktrees.isEmpty || isLoadingWorktrees || isCleaningStaleWorktrees || cleaningWorktreePath != nil)
                .accessibilityIdentifier("mac-settings-cleanup-stale-worktrees-button")
            }

            if isLoadingWorktrees && worktrees.isEmpty {
                ProgressView("Checking worktrees...")
                    .accessibilityIdentifier("mac-settings-worktrees-loading")
            } else if let worktreeError, worktrees.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Label(worktreeError, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("mac-settings-worktrees-error")
                    Button("Retry") {
                        Task { await loadWorktrees() }
                    }
                }
            } else if worktrees.isEmpty {
                ContentUnavailableView(
                    "No Worktrees",
                    systemImage: "folder",
                    description: Text("No active or stale git worktrees were found.")
                )
                .accessibilityIdentifier("mac-settings-worktrees-empty")
            } else {
                MacWorktreeSummaryCard(
                    totalCount: worktrees.count,
                    activeCount: activeWorktrees.count,
                    staleCount: staleWorktrees.count
                )
                .accessibilityIdentifier("mac-settings-worktrees-summary")

                if let worktreeActionError {
                    Label(worktreeActionError, systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("mac-settings-worktrees-action-error")
                }

                if !staleWorktrees.isEmpty {
                    Text("Needs Cleanup")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    ForEach(staleWorktrees) { worktree in
                        MacSettingsWorktreeRow(
                            worktree: worktree,
                            isCleaning: cleaningWorktreePath == worktree.path,
                            canClean: true
                        ) {
                            Task { await cleanupWorktree(path: worktree.path) }
                        }
                    }
                }

                if !activeWorktrees.isEmpty {
                    Text("Active")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    ForEach(activeWorktrees) { worktree in
                        MacSettingsWorktreeRow(
                            worktree: worktree,
                            isCleaning: false,
                            canClean: false,
                            onCleanup: {}
                        )
                    }
                }
            }
        }
    }

    private var staleWorktrees: [WorktreeInfo] {
        worktrees.filter(\.stale)
    }

    private var activeWorktrees: [WorktreeInfo] {
        worktrees.filter { !$0.stale }
    }

    private var launchAtLoginBinding: Binding<Bool> {
        Binding(
            get: { preferences.launchAtLogin },
            set: { newValue in
                isUpdatingLaunchAtLogin = true
                Task {
                    await preferences.setLaunchAtLogin(newValue)
                    isUpdatingLaunchAtLogin = false
                }
            }
        )
    }

    private var advancedEditableFields: [(key: String, value: String)] {
        [
            ("cache_ttl", cacheTTL),
            ("launch_agent", launchAgent.rawValue),
            ("claude_extra_args", claudeExtraArgs),
            ("codex_extra_args", codexExtraArgs),
            ("idle_grace_period", idleGracePeriod),
            ("idle_threshold", idleThreshold),
            ("branch_pattern", branchPattern),
            ("worktree_dir", worktreeDir),
            ("default_repo_id", defaultRepoId),
        ]
    }

    private var hasAdvancedSettingsChanges: Bool {
        advancedEditableFields.contains { $0.value != baselineAdvancedValue(for: $0.key) }
    }

    private func baselineAdvancedValue(for key: String) -> String {
        if key == "launch_agent" {
            return settings[key] ?? LaunchAgent.claude.rawValue
        }
        return settings[key] ?? ""
    }

    private var textScaleBinding: Binding<Double> {
        Binding(
            get: { preferences.textScale },
            set: { preferences.textScale = MacSidebarPreferences.clampedTextScale($0) }
        )
    }

    private func openWebSettings() {
        let baseURL = api.serverURL.isEmpty ? "http://localhost:3847" : api.serverURL
        let trimmedBaseURL = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(trimmedBaseURL)/settings") else { return }
        NSWorkspace.shared.open(url)
    }

    private func loadSettingsData() async {
        async let connectionTask: () = loadConnectionStatus()
        async let reposTask: () = loadRepos(refresh: false)
        async let advancedTask: () = loadAdvancedSettings()
        async let worktreesTask: () = loadWorktrees()
        _ = await (connectionTask, reposTask, advancedTask, worktreesTask)
    }

    private func loadConnectionStatus() async {
        guard api.isConfigured else {
            serverHealth = nil
            currentUsername = nil
            connectionError = "Not configured"
            return
        }

        isLoadingConnection = true
        defer { isLoadingConnection = false }

        do {
            async let healthFetch = api.health()
            async let userFetch = api.currentUser()
            serverHealth = try await healthFetch
            let user = try? await userFetch
            currentUsername = user?.login
            connectionError = nil
        } catch {
            serverHealth = nil
            connectionError = error.localizedDescription
        }
    }

    private func saveManualConnection() async {
        let serverURL = manualServerURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let token = manualAPIToken.trimmingCharacters(in: .whitespacesAndNewlines)
        isSavingConnection = true
        connectionSaveError = nil
        defer { isSavingConnection = false }

        do {
            _ = try await api.checkHealth(url: serverURL, token: token)
            try api.configure(url: serverURL, token: token)
            showConnectionEditor = false
            await loadSettingsData()
        } catch {
            connectionSaveError = error.localizedDescription
        }
    }

    private func reconnectFromLocalServer() async {
        isReconnectingLocal = true
        connectionSaveError = nil
        defer { isReconnectingLocal = false }

        do {
            guard let token = try LocalIssueCTLConnection().apiToken() else {
                connectionSaveError = "No local issuectl API token found in ~/.issuectl/issuectl.db."
                return
            }
            let serverURL = LocalIssueCTLConnection.defaultServerURL
            _ = try await api.checkHealth(url: serverURL, token: token)
            try api.configure(url: serverURL, token: token)
            syncManualConnectionFields()
            await loadSettingsData()
        } catch {
            connectionSaveError = error.localizedDescription
        }
    }

    private func disconnect() {
        api.disconnect()
        sidebarCoordinator.store.reset()
        repos = []
        serverHealth = nil
        currentUsername = nil
        connectionError = "Disconnected"
        settings = [:]
        settingsError = nil
        worktrees = []
        worktreeError = nil
        worktreeActionError = nil
        syncManualConnectionFields()
    }

    private func syncManualConnectionFields() {
        manualServerURL = api.serverURL.isEmpty ? LocalIssueCTLConnection.defaultServerURL : api.serverURL
        manualAPIToken = api.apiToken
    }

    private func loadAdvancedSettings() async {
        guard api.isConfigured else {
            settings = [:]
            applyAdvancedSettings()
            settingsError = "Connect to issuectl web before editing advanced settings."
            return
        }

        isLoadingSettings = true
        settingsError = nil
        defer { isLoadingSettings = false }

        do {
            settings = try await api.getSettings()
            applyAdvancedSettings()
        } catch {
            settingsError = error.localizedDescription
        }
    }

    private func applyAdvancedSettings() {
        cacheTTL = settings["cache_ttl"] ?? ""
        launchAgent = LaunchAgent.settingValue(settings["launch_agent"])
        claudeExtraArgs = settings["claude_extra_args"] ?? ""
        codexExtraArgs = settings["codex_extra_args"] ?? ""
        idleGracePeriod = settings["idle_grace_period"] ?? ""
        idleThreshold = settings["idle_threshold"] ?? ""
        branchPattern = settings["branch_pattern"] ?? ""
        worktreeDir = settings["worktree_dir"] ?? ""
        defaultRepoId = settings["default_repo_id"] ?? ""
    }

    private func saveAdvancedSettings() async {
        let updates = Dictionary(uniqueKeysWithValues: advancedEditableFields
            .filter { $0.value != baselineAdvancedValue(for: $0.key) }
            .map { ($0.key, $0.value) })
        guard !updates.isEmpty else { return }

        isSavingSettings = true
        settingsSaveError = nil
        showSettingsSaved = false
        defer { isSavingSettings = false }

        do {
            let response = try await api.updateSettings(updates)
            guard response.success else {
                settingsSaveError = response.error ?? "Failed to save settings"
                return
            }
            settings.merge(updates) { _, new in new }
            showSettingsSaved = true
            try? await Task.sleep(for: .seconds(2))
            showSettingsSaved = false
        } catch {
            settingsSaveError = error.localizedDescription
        }
    }

    private func loadWorktrees() async {
        guard api.isConfigured else {
            worktrees = []
            worktreeError = "Connect to issuectl web before checking worktrees."
            return
        }

        isLoadingWorktrees = true
        worktreeError = nil
        worktreeActionError = nil
        defer { isLoadingWorktrees = false }

        do {
            worktrees = try await api.listWorktrees()
        } catch {
            worktreeError = error.localizedDescription
        }
    }

    private func cleanupWorktree(path: String) async {
        cleaningWorktreePath = path
        worktreeActionError = nil
        defer { cleaningWorktreePath = nil }

        do {
            let response = try await api.cleanupWorktree(path: path)
            guard response.success else {
                worktreeActionError = response.error ?? "Failed to clean up worktree"
                return
            }
            worktrees.removeAll { $0.path == path }
        } catch {
            worktreeActionError = error.localizedDescription
        }
    }

    private func cleanupStaleWorktrees() async {
        isCleaningStaleWorktrees = true
        worktreeActionError = nil
        defer { isCleaningStaleWorktrees = false }

        do {
            let response = try await api.cleanupStaleWorktrees()
            guard response.success else {
                worktreeActionError = response.error ?? "Failed to clean up stale worktrees"
                return
            }
            await loadWorktrees()
        } catch {
            worktreeActionError = error.localizedDescription
        }
    }

    private func loadRepos(refresh: Bool) async {
        isLoadingRepos = true
        defer { isLoadingRepos = false }

        do {
            repos = try await api.repos(refresh: refresh)
            repoError = nil
            syncSidebarRepoFilters()
        } catch {
            repoError = error.localizedDescription
        }
    }

    private func upsertRepo(_ repo: Repo) {
        if let index = repos.firstIndex(where: { $0.id == repo.id || $0.fullName == repo.fullName }) {
            repos[index] = repo
        } else {
            repos.insert(repo, at: 0)
        }
        syncSidebarRepoFilters()
    }

    private func remove(_ repo: Repo) async {
        repoPendingRemoval = nil
        removingRepoFullName = repo.fullName
        repoError = nil
        defer { removingRepoFullName = nil }

        do {
            try await api.removeRepo(owner: repo.owner, name: repo.name)
            repos.removeAll { $0.id == repo.id || $0.fullName == repo.fullName }
            await refreshSidebarAfterRepoMutation()
        } catch {
            repoError = "Failed to remove \(repo.fullName): \(error.localizedDescription)"
            await loadRepos(refresh: true)
        }
    }

    private func refreshSidebarAfterRepoMutation() async {
        syncSidebarRepoFilters()
        await sidebarCoordinator.store.load(api: api, refresh: true)
        syncSidebarRepoFilters()
    }

    private func syncSidebarRepoFilters() {
        for state in sidebarCoordinator.spaceStates {
            state.issueFilterState.syncRepoSelection(repos: repos)
        }
    }

    private func spaceSettingsRow(_ spaceState: MacSidebarSpaceState) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(spaceState.title)
                        .font(.headline)
                    Text(spaceState.id == sidebarCoordinator.currentSpaceState?.id ? "Current desktop" : "Learned desktop")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(spaceState.chrome.isVisible ? "Visible" : "Hidden")
                    .foregroundStyle(.secondary)
            }

            Toggle("Open Collapsed", isOn: Binding(
                get: { spaceState.preferences.isCollapsed },
                set: { newValue in
                    spaceState.preferences.isCollapsed = newValue
                    if spaceState.chrome.isCollapsed != newValue {
                        sidebarCoordinator.toggleCollapsed(spaceKey: spaceState.id)
                    }
                }
            ))

            HStack {
                Text("Saved Width")
                Spacer()
                Text("\(Int(spaceState.preferences.expandedWidth)) px")
                    .foregroundStyle(.secondary)
            }

            HStack {
                Button(spaceState.chrome.isVisible ? "Hide" : "Show") {
                    sidebarCoordinator.toggleVisibility(spaceKey: spaceState.id)
                }
                Button(spaceState.chrome.isCollapsed ? "Expand" : "Collapse") {
                    sidebarCoordinator.toggleCollapsed(spaceKey: spaceState.id)
                }
                Button("Reset") {
                    sidebarCoordinator.resetLayout(spaceKey: spaceState.id)
                }
            }
        }
        .padding(.vertical, 6)
    }
}

private struct MacConnectionStatusCard: View {
    let serverURL: String
    let username: String?
    let repoCount: Int
    let serverVersion: String?
    let appVersion: String
    let tokenSaved: Bool
    let error: String?
    let isLoading: Bool
    let retry: () -> Void

    private var statusTitle: String {
        if isLoading { return "Checking" }
        if serverURL.isEmpty { return "Not Configured" }
        return error == nil ? "Connected" : "Needs Attention"
    }

    private var statusIcon: String {
        if isLoading { return "arrow.clockwise" }
        if serverURL.isEmpty { return "link.badge.plus" }
        return error == nil ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
    }

    private var statusColor: Color {
        if isLoading || serverURL.isEmpty { return .secondary }
        return error == nil ? .green : .orange
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: statusIcon)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(statusColor)
                    .frame(width: 34, height: 34)

                VStack(alignment: .leading, spacing: 3) {
                    Text(statusTitle)
                        .font(.headline)
                    Text(serverURL.isEmpty ? LocalIssueCTLConnection.defaultServerURL : serverURL)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }

                Spacer()

                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Button {
                        retry()
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .buttonStyle(.borderless)
                    .help("Retry connection")
                    .accessibilityLabel("Retry connection")
                    .accessibilityIdentifier("mac-settings-connection-retry-button")
                }
            }

            HStack(spacing: 8) {
                summaryMetric("Repos", "\(repoCount)", "folder")
                summaryMetric("Token", tokenSaved ? "Saved" : "Missing", "key.fill")
                summaryMetric("App", appVersion, "desktopcomputer")
            }

            if let username {
                Label(username, systemImage: "person.crop.circle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let serverVersion {
                Label("Server \(serverVersion)", systemImage: "server.rack")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("mac-settings-connection-error")
            }
        }
        .padding(12)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("mac-settings-connection-status")
    }

    private func summaryMetric(_ title: String, _ value: String, _ systemImage: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Label(title, systemImage: systemImage)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Color(nsColor: .windowBackgroundColor), in: RoundedRectangle(cornerRadius: 6))
    }
}

private enum MacSettingsAppVersion {
    static var display: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
        return "\(version) (\(build))"
    }
}

private struct MacWorktreeSummaryCard: View {
    let totalCount: Int
    let activeCount: Int
    let staleCount: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: staleCount > 0 ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(staleCount > 0 ? .orange : .green)
                    .frame(width: 32, height: 32)

                VStack(alignment: .leading, spacing: 2) {
                    Text(staleCount > 0 ? "Cleanup Available" : "Worktrees Clear")
                        .font(.headline)
                    Text(staleCount > 0 ? "\(staleCount) stale worktree\(staleCount == 1 ? "" : "s") can be cleaned up." : "No stale worktrees were found.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 8) {
                metric("Total", totalCount, "folder")
                metric("Active", activeCount, "checkmark.circle")
                metric("Stale", staleCount, "exclamationmark.circle")
            }
        }
        .padding(12)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
    }

    private func metric(_ title: String, _ value: Int, _ systemImage: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Label(title, systemImage: systemImage)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text("\(value)")
                .font(.caption.weight(.semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Color(nsColor: .windowBackgroundColor), in: RoundedRectangle(cornerRadius: 6))
    }
}

private struct MacSettingsWorktreeRow: View {
    let worktree: WorktreeInfo
    let isCleaning: Bool
    let canClean: Bool
    let onCleanup: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: worktree.stale ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                .foregroundStyle(worktree.stale ? .orange : .green)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(worktree.name)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                        .truncationMode(.middle)

                    Text(worktree.stale ? "Stale" : "Active")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(worktree.stale ? .orange : .green)
                }

                if let repoFullName = worktree.repoFullName {
                    Label(repoFullName, systemImage: "arrow.triangle.branch")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let issueNumber = worktree.issueNumber {
                    Label("Issue #\(issueNumber)", systemImage: "number")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Label(worktree.path, systemImage: "externaldrive")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            Spacer(minLength: 8)

            if isCleaning {
                ProgressView()
                    .controlSize(.small)
            } else if canClean {
                Button(role: .destructive) {
                    onCleanup()
                } label: {
                    Label("Clean Up", systemImage: "trash")
                }
                .accessibilityIdentifier("mac-settings-cleanup-worktree-\(worktree.name)")
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("mac-settings-worktree-row-\(worktree.name)")
    }
}

private struct MacSettingsRepoRow: View {
    let repo: Repo
    let isRemoving: Bool
    let onEdit: () -> Void
    let onRemove: () -> Void

    private var hasLocalPath: Bool {
        repo.localPath?.isEmpty == false
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: hasLocalPath ? "folder.badge.gearshape" : "folder.badge.questionmark")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(hasLocalPath ? .blue : .orange)
                .frame(width: 30, height: 30)

            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text(repo.fullName)
                        .font(.headline)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer()
                    Text(hasLocalPath ? "Ready" : "Path needed")
                        .font(.caption)
                        .foregroundStyle(hasLocalPath ? .green : .orange)
                }

                if let localPath = repo.localPath, !localPath.isEmpty {
                    Label(localPath, systemImage: "externaldrive")
                        .lineLimit(1)
                        .truncationMode(.middle)
                } else {
                    Text("Add a local clone path before launching work sessions.")
                }

                Label(repo.branchPattern?.isEmpty == false ? repo.branchPattern! : "Default branch pattern", systemImage: "arrow.triangle.branch")
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            Spacer(minLength: 8)

            if isRemoving {
                ProgressView()
                    .controlSize(.small)
            } else {
                Menu {
                    Button("Edit") {
                        onEdit()
                    }
                    .accessibilityIdentifier("mac-settings-edit-repository-\(repo.fullName)")

                    Button("Remove", role: .destructive) {
                        onRemove()
                    }
                    .accessibilityIdentifier("mac-settings-remove-repository-\(repo.fullName)")
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .menuStyle(.button)
                .accessibilityIdentifier("mac-settings-repository-menu-\(repo.fullName)")
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("mac-settings-repository-row-\(repo.fullName)")
    }
}

private struct MacAddRepoSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss
    let trackedRepos: [Repo]
    let onAdded: (Repo) async -> Void

    @State private var fullName = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var browseRepos: [GitHubAccessibleRepo] = []
    @State private var browseSearch = ""
    @State private var browseError: String?
    @State private var isBrowseLoading = false

    private var trackedFullNames: Set<String> {
        Set(trackedRepos.map(\.fullName))
    }

    private var parsedInput: MacRepoNameInput? {
        try? MacRepoNameInput.parse(fullName)
    }

    private var filteredBrowseRepos: [GitHubAccessibleRepo] {
        guard !browseSearch.isEmpty else { return browseRepos }
        let query = browseSearch.lowercased()
        return browseRepos.filter { $0.fullName.lowercased().contains(query) }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Manual") {
                    TextField("owner/name", text: $fullName)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("mac-add-repo-full-name-field")

                    if let parsedInput {
                        Text("Will add \(parsedInput.fullName)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else if !fullName.isEmpty {
                        Text(MacRepoNameInputError.invalidFormat.localizedDescription)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }

                Section("Browse GitHub") {
                    HStack {
                        TextField("Search repos", text: $browseSearch)
                            .textFieldStyle(.roundedBorder)
                            .accessibilityIdentifier("mac-add-repo-browse-search-field")
                        Button {
                            Task { await loadBrowseRepos(refresh: true) }
                        } label: {
                            Label("Refresh", systemImage: "arrow.clockwise")
                        }
                        .disabled(isBrowseLoading)
                        .accessibilityIdentifier("mac-add-repo-browse-refresh-button")
                    }

                    if isBrowseLoading && browseRepos.isEmpty {
                        ProgressView("Loading GitHub repos...")
                    } else if let browseError {
                        Label(browseError, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .accessibilityIdentifier("mac-add-repo-browse-error")
                    } else if browseRepos.isEmpty {
                        Text("Refresh to load accessible GitHub repositories.")
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("mac-add-repo-browse-empty")
                    } else {
                        ForEach(filteredBrowseRepos) { repo in
                            Button {
                                fullName = repo.fullName
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(repo.fullName)
                                            .foregroundStyle(.primary)
                                        if let pushedAt = repo.pushedAt {
                                            Text("Pushed \(pushedAt)")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    Spacer()
                                    if trackedFullNames.contains(repo.fullName) {
                                        Text("Tracked")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    } else if repo.private {
                                        Image(systemName: "lock.fill")
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .disabled(trackedFullNames.contains(repo.fullName))
                            .accessibilityIdentifier("mac-add-repo-browse-row-\(repo.fullName)")
                        }
                    }
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .accessibilityIdentifier("mac-add-repo-error")
                    }
                }
            }
            .navigationTitle("Add Repository")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSubmitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Button("Add") {
                            Task { await submit() }
                        }
                        .disabled(parsedInput == nil)
                        .accessibilityIdentifier("mac-add-repo-submit-button")
                    }
                }
            }
            .frame(width: 460, height: 520)
            .task {
                await loadBrowseRepos(refresh: false)
            }
        }
    }

    private func loadBrowseRepos(refresh: Bool) async {
        isBrowseLoading = true
        browseError = nil
        defer { isBrowseLoading = false }

        do {
            browseRepos = try await api.githubRepos(refresh: refresh).repos
        } catch {
            browseError = error.localizedDescription
        }
    }

    private func submit() async {
        do {
            let input = try MacRepoNameInput.parse(fullName)
            isSubmitting = true
            errorMessage = nil
            defer { isSubmitting = false }

            let repo = try await api.addRepo(owner: input.owner, name: input.name)
            await onAdded(repo)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct MacEditRepoSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss
    let repo: Repo
    let onUpdated: (Repo) async -> Void

    @State private var localPath: String
    @State private var branchPattern: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(repo: Repo, onUpdated: @escaping (Repo) async -> Void) {
        self.repo = repo
        self.onUpdated = onUpdated
        _localPath = State(initialValue: repo.localPath ?? "")
        _branchPattern = State(initialValue: repo.branchPattern ?? "")
    }

    private var hasChanges: Bool {
        localPath.trimmingCharacters(in: .whitespacesAndNewlines) != (repo.localPath ?? "")
            || branchPattern.trimmingCharacters(in: .whitespacesAndNewlines) != (repo.branchPattern ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Repository") {
                    Text(repo.fullName)
                        .font(.headline)
                    Text(repo.localPath?.isEmpty == false ? "Ready for local sessions." : "Add a local clone path to improve launches.")
                        .foregroundStyle(.secondary)
                }

                Section("Local Clone") {
                    TextField("Local path", text: $localPath)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("mac-edit-repo-local-path-field")
                }

                Section("Branch Pattern") {
                    TextField("Branch pattern", text: $branchPattern)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("mac-edit-repo-branch-pattern-field")
                    Text("Leave blank to use the server default.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .accessibilityIdentifier("mac-edit-repo-error")
                    }
                }
            }
            .navigationTitle("Edit Repository")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Save") {
                            Task { await save() }
                        }
                        .disabled(!hasChanges)
                        .accessibilityIdentifier("mac-edit-repo-save-button")
                    }
                }
            }
            .frame(width: 440, height: 360)
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        do {
            let updated = try await api.updateRepo(
                owner: repo.owner,
                name: repo.name,
                localPath: localPath.trimmingCharacters(in: .whitespacesAndNewlines),
                branchPattern: branchPattern.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            await onUpdated(updated)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
