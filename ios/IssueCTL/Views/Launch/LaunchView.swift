import SwiftUI

struct LaunchView: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let owner: String
    let repo: String
    let issueNumber: Int
    let issueTitle: String
    let comments: [GitHubComment]
    let referencedFiles: [String]
    let repoLocalPath: String?

    @State private var branchName: String
    @State private var workspaceMode: WorkspaceMode
    @State private var showCloneWarning: Bool
    @State private var selectedCommentIndices: Set<Int> = []
    @State private var selectedFilePaths: Set<String> = []
    @State private var preamble = ""
    @State private var isLaunching = false
    @State private var showProgress = false
    @State private var errorMessage: String?
    @State private var launchedPort: Int?
    @State private var launchedDeployment: ActiveDeployment?
    @State private var existingDeployment: ActiveDeployment?
    @State private var isCheckingActiveSession = false
    @State private var shouldDismissAfterTerminalClose = false
    @State private var dirtyWorktree = false
    @State private var isResettingWorktree = false
    @State private var showAdvancedOptions = false

    init(owner: String, repo: String, issueNumber: Int, issueTitle: String, comments: [GitHubComment], referencedFiles: [String], repoLocalPath: String? = nil) {
        self.owner = owner
        self.repo = repo
        self.issueNumber = issueNumber
        self.issueTitle = issueTitle
        self.comments = comments
        self.referencedFiles = referencedFiles
        self.repoLocalPath = repoLocalPath

        _branchName = State(initialValue: generateBranchName(issueNumber: issueNumber, issueTitle: issueTitle))
        let needsClone = repoLocalPath == nil || repoLocalPath?.isEmpty == true
        _workspaceMode = State(initialValue: needsClone ? .clone : .worktree)
        _showCloneWarning = State(initialValue: needsClone)
    }

    var body: some View {
        NavigationStack {
            if showProgress {
                LaunchProgressView(
                    owner: owner,
                    repo: repo,
                    issueNumber: issueNumber,
                    branchName: branchName
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(.systemGroupedBackground))
                .navigationTitle("Launching…")
                .navigationBarTitleDisplayMode(.inline)
            } else {
                launchForm
            }
        }
        .fullScreenCover(
            item: $launchedDeployment,
            onDismiss: {
                if shouldDismissAfterTerminalClose {
                    shouldDismissAfterTerminalClose = false
                    dismiss()
                }
            }
        ) { deployment in
            if let port = launchedPort {
                TerminalView(
                    deployment: deployment,
                    port: port,
                    onEnd: { dismiss() }
                )
            } else {
                NavigationStack {
                    ContentUnavailableView {
                        Label("Terminal Error", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text("Terminal port was not assigned.")
                    }
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Dismiss") { dismiss() }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var launchForm: some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Launch Claude Code")
                            .font(.title2.weight(.bold))
                        Text("#\(issueNumber) \(issueTitle)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }

                    if let existingDeployment {
                        Button {
                            openExistingTerminal(existingDeployment)
                        } label: {
                            Label("Re-enter Running Terminal", systemImage: "terminal")
                                .font(.subheadline.weight(.bold))
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(IssueCTLColors.action)
                        .disabled(existingDeployment.ttydPort == nil)
                        .accessibilityIdentifier("launch-reenter-terminal-button")
                    } else {
                        launchButton
                    }

                    Text(recommendedSummary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, 4)
            }

            if showCloneWarning {
                Section {
                    Label("This repository has no local clone. A fresh clone will be created.", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                        .font(.subheadline)
                }
            }

            if let existingDeployment {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Claude Code is already running for this issue.", systemImage: "terminal")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.blue)

                        HStack(spacing: 12) {
                            Text(existingDeployment.runningDuration)
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            Spacer()

                            if existingDeployment.ttydPort == nil {
                                Text("Terminal starting")
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }

            if dirtyWorktree {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Previous session left uncommitted changes", systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                            .font(.subheadline.weight(.medium))

                        HStack(spacing: 12) {
                            Button(role: .destructive) {
                                Task { await resetDirtyWorktree() }
                            } label: {
                                if isResettingWorktree {
                                    ProgressView()
                                        .controlSize(.small)
                                } else {
                                    Text("Discard & Start Fresh")
                                }
                            }
                            .buttonStyle(.bordered)
                            .disabled(isResettingWorktree)

                            Button {
                                launchWithForceResume()
                            } label: {
                                Text("Resume with Changes")
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    }
                }
            }

            Section {
                DisclosureGroup(isExpanded: $showAdvancedOptions) {
                    VStack(alignment: .leading, spacing: 18) {
                        workspaceOptions
                        branchOptions
                        commentOptions
                        fileOptions
                        preambleOptions
                    }
                    .padding(.top, 8)
                } label: {
                    Label("Advanced Options", systemImage: "slider.horizontal.3")
                        .font(.subheadline.weight(.medium))
                }
                .accessibilityIdentifier("launch-advanced-options")
            }

            if let errorMessage {
                Section {
                    Label(errorMessage, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("Launch")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Cancel") { dismiss() }
                    .accessibilityIdentifier("launch-cancel-button")
            }
        }
        .task {
            await loadExistingDeployment()
            if repoLocalPath == nil {
                do {
                    let repos = try await api.repos()
                    if let match = repos.first(where: { $0.owner == owner && $0.name == repo }) {
                        let needsClone = match.localPath == nil || match.localPath?.isEmpty == true
                        showCloneWarning = needsClone
                        workspaceMode = needsClone ? .clone : .worktree
                    }
                } catch {
                    // Could not verify clone status — unlock the picker so user can choose
                    showCloneWarning = false
                }
            }
            if workspaceMode == .worktree {
                do {
                    let status = try await api.checkWorktreeStatus(
                        owner: owner, repo: repo, issueNumber: issueNumber
                    )
                    if status.isDirty {
                        dirtyWorktree = true
                    }
                } catch {
                    // Assume dirty when check fails — safer than losing uncommitted work
                    dirtyWorktree = true
                }
            }
        }
    }

    private var launchButton: some View {
        Button {
            Task { await launchSession() }
        } label: {
            if isLaunching || isCheckingActiveSession {
                ProgressView()
                    .frame(maxWidth: .infinity)
            } else {
                Label("Launch with Recommended Settings", systemImage: "play.fill")
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity)
            }
        }
        .buttonStyle(.borderedProminent)
        .tint(IssueCTLColors.action)
        .disabled(branchName.isEmpty || isLaunching || isCheckingActiveSession)
        .accessibilityIdentifier("launch-recommended-button")
    }

    private var recommendedSummary: String {
        let mode: String
        switch workspaceMode {
        case .worktree:
            mode = "new worktree"
        case .existing:
            mode = "existing checkout"
        case .clone:
            mode = "fresh clone"
        }
        return "\(mode.capitalized) workspace - \(branchName.isEmpty ? "generated branch" : branchName)"
    }

    private var workspaceOptions: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Workspace Mode")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Picker("Mode", selection: $workspaceMode) {
                Text("Worktree").tag(WorkspaceMode.worktree)
                Text("Existing").tag(WorkspaceMode.existing)
                Text("Clone").tag(WorkspaceMode.clone)
            }
            .pickerStyle(.segmented)
            .disabled(showCloneWarning)
            .accessibilityIdentifier("workspace-mode-picker")
        }
    }

    private var branchOptions: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Branch Name")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            TextField("Branch name", text: $branchName)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.body.monospaced())
                .textFieldStyle(.roundedBorder)
        }
    }

    @ViewBuilder
    private var commentOptions: some View {
        if !comments.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Include Comments")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                ForEach(Array(comments.enumerated()), id: \.offset) { index, comment in
                    Toggle(isOn: Binding(
                        get: { selectedCommentIndices.contains(index) },
                        set: { isOn in
                            if isOn { selectedCommentIndices.insert(index) }
                            else { selectedCommentIndices.remove(index) }
                        }
                    )) {
                        VStack(alignment: .leading, spacing: 2) {
                            if let user = comment.user {
                                Text(user.login)
                                    .font(.caption.weight(.medium))
                            }
                            Text(comment.body)
                                .font(.caption)
                                .lineLimit(2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var fileOptions: some View {
        if !referencedFiles.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Include Files")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                ForEach(referencedFiles, id: \.self) { filePath in
                    Toggle(isOn: Binding(
                        get: { selectedFilePaths.contains(filePath) },
                        set: { isOn in
                            if isOn { selectedFilePaths.insert(filePath) }
                            else { selectedFilePaths.remove(filePath) }
                        }
                    )) {
                        Text(filePath)
                            .font(.caption.monospaced())
                            .lineLimit(1)
                    }
                }
            }
        }
    }

    private var preambleOptions: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Preamble")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            TextEditor(text: $preamble)
                .frame(minHeight: 80)
                .font(.body)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color(.separator), lineWidth: 0.5)
                )
        }
    }

    private func resetDirtyWorktree() async {
        isResettingWorktree = true
        do {
            let response = try await api.resetWorktree(
                owner: owner, repo: repo, issueNumber: issueNumber
            )
            if response.success {
                dirtyWorktree = false
            } else {
                errorMessage = response.error ?? "Failed to reset worktree"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isResettingWorktree = false
    }

    private func launchWithForceResume() {
        Task { await performLaunch(forceResume: true) }
    }

    private func launchSession() async {
        await performLaunch(forceResume: nil)
    }

    private func loadExistingDeployment() async {
        isCheckingActiveSession = true
        defer { isCheckingActiveSession = false }
        do {
            existingDeployment = try await findExistingDeployment()
        } catch {
            existingDeployment = nil
        }
    }

    private func findExistingDeployment() async throws -> ActiveDeployment? {
        let response = try await api.activeDeployments()
        return response.deployments.first {
            $0.isActive &&
            $0.owner == owner &&
            $0.repoName == repo &&
            $0.issueNumber == issueNumber
        }
    }

    private func openExistingTerminal(_ deployment: ActiveDeployment) {
        guard let port = deployment.ttydPort else {
            errorMessage = "Session is running, but its terminal is not ready yet."
            return
        }
        shouldDismissAfterTerminalClose = true
        launchedPort = port
        launchedDeployment = deployment
    }

    private func performLaunch(forceResume: Bool?) async {
        isLaunching = true
        errorMessage = nil

        defer {
            isLaunching = false
            if launchedDeployment == nil {
                withAnimation { showProgress = false }
            }
        }

        do {
            if let existing = try await findExistingDeployment() {
                existingDeployment = existing
                openExistingTerminal(existing)
                return
            }

            withAnimation { showProgress = true }

            let body = LaunchRequestBody(
                branchName: branchName,
                workspaceMode: workspaceMode,
                selectedCommentIndices: Array(selectedCommentIndices).sorted(),
                selectedFilePaths: Array(selectedFilePaths),
                preamble: preamble.isEmpty ? nil : preamble,
                forceResume: forceResume,
                idempotencyKey: UUID().uuidString
            )
            let response = try await api.launch(
                owner: owner, repo: repo, number: issueNumber, body: body
            )
            if response.success, let deploymentId = response.deploymentId, let port = response.ttydPort {
                shouldDismissAfterTerminalClose = true
                launchedPort = port
                let deployment = ActiveDeployment(
                    id: deploymentId,
                    repoId: 0,
                    issueNumber: issueNumber,
                    branchName: branchName,
                    workspaceMode: workspaceMode,
                    workspacePath: "",
                    linkedPrNumber: nil,
                    state: .active,
                    launchedAt: sharedISO8601Formatter.string(from: Date()),
                    endedAt: nil, ttydPort: port, ttydPid: nil,
                    owner: owner, repoName: repo
                )
                existingDeployment = deployment
                launchedDeployment = deployment
            } else {
                errorMessage = response.error ?? "Launch failed"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
