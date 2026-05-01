import SwiftUI

struct AdvancedSettingsView: View {
    @Environment(APIClient.self) private var api
    @State private var settings: [String: String] = [:]
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var isSaving = false
    @State private var saveError: String?
    @State private var showSaveSuccess = false

    // Editable fields
    @State private var cacheTTL = ""
    @State private var launchAgent: LaunchAgent = .claude
    @State private var claudeExtraArgs = ""
    @State private var codexExtraArgs = ""
    @State private var idleGracePeriod = ""
    @State private var idleThreshold = ""
    @State private var branchPattern = ""
    @State private var worktreeDir = ""
    @State private var defaultRepoId = ""
    @State private var repos: [Repo] = []

    private var editableFields: [(key: String, value: String)] {
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

    private var hasChanges: Bool {
        editableFields.contains { $0.value != baselineValue(for: $0.key) }
    }

    private func baselineValue(for key: String) -> String {
        if key == "launch_agent" {
            return settings[key] ?? LaunchAgent.claude.rawValue
        }
        return settings[key] ?? ""
    }

    var body: some View {
        Form {
            if isLoading {
                Section {
                    HStack {
                        Spacer()
                        ProgressView("Loading settings...")
                        Spacer()
                    }
                }
            } else if let errorMessage {
                Section {
                    ContentUnavailableView {
                        Label("Error", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(errorMessage)
                    } actions: {
                        Button("Retry") { Task { await load() } }
                    }
                }
            } else {
                Section {
                    TextField("Cache TTL (seconds)", text: $cacheTTL)
                        .keyboardType(.numberPad)
                } header: {
                    Text("Cache")
                } footer: {
                    Text("How long to cache GitHub data (0–604800 seconds). Default: 300.")
                }

                Section {
                    Picker("Default Launch Agent", selection: $launchAgent) {
                        ForEach(LaunchAgent.allCases) { agent in
                            Text(agent.displayName).tag(agent)
                        }
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text("Launch Agent")
                } footer: {
                    Text("Default agent used when launching a new terminal session.")
                }

                Section {
                    TextField("Extra arguments", text: $claudeExtraArgs)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("Claude CLI")
                } footer: {
                    Text("Additional arguments passed to Claude Code on launch.")
                }

                Section {
                    TextField("Extra arguments", text: $codexExtraArgs)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("Codex CLI")
                } footer: {
                    Text("Additional arguments passed to Codex on launch.")
                }

                Section {
                    TextField("Grace period (seconds)", text: $idleGracePeriod)
                        .keyboardType(.numberPad)
                    TextField("Threshold (seconds)", text: $idleThreshold)
                        .keyboardType(.numberPad)
                } header: {
                    Text("Idle Timeout")
                } footer: {
                    Text("Grace period before checking idle. Threshold defines when a session is considered idle.")
                }

                Section {
                    TextField("Branch pattern", text: $branchPattern)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("Default Branch Pattern")
                } footer: {
                    Text("Default naming pattern for branches (e.g. issue-{{number}}-{{slug}}).")
                }

                Section {
                    TextField("Worktree directory", text: $worktreeDir)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("Worktree Directory")
                } footer: {
                    Text("Directory where git worktrees are created.")
                }

                Section {
                    Picker("Default Repository", selection: $defaultRepoId) {
                        Text("None").tag("")
                        ForEach(repos) { repo in
                            Text(repo.fullName).tag(String(repo.id))
                        }
                    }
                } header: {
                    Text("Default Repository")
                } footer: {
                    Text("Pre-selected repository when creating new drafts.")
                }

                if let saveError {
                    Section {
                        Label(saveError, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }
            }
        }
        .navigationTitle("Advanced Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if isSaving {
                    ProgressView()
                } else if showSaveSuccess {
                    Label("Saved", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                } else {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(!hasChanges)
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            async let settingsFetch = api.getSettings()
            async let reposFetch = api.repos()
            settings = try await settingsFetch
            repos = try await reposFetch
            cacheTTL = settings["cache_ttl"] ?? ""
            launchAgent = LaunchAgent.settingValue(settings["launch_agent"])
            claudeExtraArgs = settings["claude_extra_args"] ?? ""
            codexExtraArgs = settings["codex_extra_args"] ?? ""
            idleGracePeriod = settings["idle_grace_period"] ?? ""
            idleThreshold = settings["idle_threshold"] ?? ""
            branchPattern = settings["branch_pattern"] ?? ""
            worktreeDir = settings["worktree_dir"] ?? ""
            defaultRepoId = settings["default_repo_id"] ?? ""
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func save() async {
        isSaving = true
        saveError = nil
        showSaveSuccess = false
        defer { isSaving = false }

        let updates = Dictionary(
            uniqueKeysWithValues: editableFields.filter { $0.value != baselineValue(for: $0.key) }
                .map { ($0.key, $0.value) }
        )

        guard !updates.isEmpty else { return }

        do {
            let response = try await api.updateSettings(updates)
            if response.success {
                // Update baseline so dirty-state detection resets
                settings.merge(updates) { _, new in new }

                // Show brief success indicator
                showSaveSuccess = true
                try? await Task.sleep(for: .seconds(2))
                showSaveSuccess = false
            } else {
                saveError = response.error ?? "Failed to save settings"
            }
        } catch {
            saveError = error.localizedDescription
        }
    }
}
