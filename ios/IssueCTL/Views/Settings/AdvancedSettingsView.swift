import SwiftUI

struct AdvancedSettingsView: View {
    @Environment(APIClient.self) private var api
    @State private var settings: [String: String] = [:]
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var isSaving = false
    @State private var saveError: String?

    // Editable fields
    @State private var cacheTTL = ""
    @State private var claudeExtraArgs = ""
    @State private var idleGracePeriod = ""
    @State private var idleThreshold = ""
    @State private var branchPattern = ""
    @State private var worktreeDir = ""

    private var hasChanges: Bool {
        cacheTTL != (settings["cache_ttl"] ?? "") ||
        claudeExtraArgs != (settings["claude_extra_args"] ?? "") ||
        idleGracePeriod != (settings["idle_grace_period"] ?? "") ||
        idleThreshold != (settings["idle_threshold"] ?? "") ||
        branchPattern != (settings["branch_pattern"] ?? "") ||
        worktreeDir != (settings["worktree_dir"] ?? "")
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
                    TextField("Extra arguments", text: $claudeExtraArgs)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("Claude CLI")
                } footer: {
                    Text("Additional arguments passed to Claude Code on launch.")
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
            settings = try await api.getSettings()
            cacheTTL = settings["cache_ttl"] ?? ""
            claudeExtraArgs = settings["claude_extra_args"] ?? ""
            idleGracePeriod = settings["idle_grace_period"] ?? ""
            idleThreshold = settings["idle_threshold"] ?? ""
            branchPattern = settings["branch_pattern"] ?? ""
            worktreeDir = settings["worktree_dir"] ?? ""
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func save() async {
        isSaving = true
        saveError = nil
        defer { isSaving = false }

        var updates: [String: String] = [:]
        if cacheTTL != (settings["cache_ttl"] ?? "") { updates["cache_ttl"] = cacheTTL }
        if claudeExtraArgs != (settings["claude_extra_args"] ?? "") { updates["claude_extra_args"] = claudeExtraArgs }
        if idleGracePeriod != (settings["idle_grace_period"] ?? "") { updates["idle_grace_period"] = idleGracePeriod }
        if idleThreshold != (settings["idle_threshold"] ?? "") { updates["idle_threshold"] = idleThreshold }
        if branchPattern != (settings["branch_pattern"] ?? "") { updates["branch_pattern"] = branchPattern }
        if worktreeDir != (settings["worktree_dir"] ?? "") { updates["worktree_dir"] = worktreeDir }

        guard !updates.isEmpty else { return }

        do {
            let response = try await api.updateSettings(updates)
            if response.success {
                settings.merge(updates) { _, new in new }
            } else {
                saveError = response.error ?? "Failed to save settings"
            }
        } catch {
            saveError = error.localizedDescription
        }
    }
}
