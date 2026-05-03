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
    let onSessionAvailable: (ActiveDeployment) -> Void

    @State private var branchName: String
    @State private var workspaceMode: WorkspaceMode
    @State private var showCloneWarning: Bool
    @State private var selectedCommentIndices: Set<Int> = []
    @State private var selectedFilePaths: Set<String> = []
    @State private var selectedAgent: LaunchAgent = .claude
    @State private var preamble = ""
    @State private var isLaunching = false
    @State private var showProgress = false
    @State private var errorMessage: String?
    @State private var launchedPort: Int?
    @State private var launchedDeployment: ActiveDeployment?
    @State private var existingDeployment: ActiveDeployment?
    @State private var isLoadingLaunchSettings = false
    @State private var isCheckingActiveSession = false
    @State private var shouldDismissAfterTerminalClose = false
    @State private var dirtyWorktree = false
    @State private var isResettingWorktree = false
    @State private var showAdvancedOptions = false

    init(
        owner: String,
        repo: String,
        issueNumber: Int,
        issueTitle: String,
        comments: [GitHubComment],
        referencedFiles: [String],
        repoLocalPath: String? = nil,
        onSessionAvailable: @escaping (ActiveDeployment) -> Void = { _ in }
    ) {
        self.owner = owner
        self.repo = repo
        self.issueNumber = issueNumber
        self.issueTitle = issueTitle
        self.comments = comments
        self.referencedFiles = referencedFiles
        self.repoLocalPath = repoLocalPath
        self.onSessionAvailable = onSessionAvailable

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
                    branchName: branchName,
                    agent: selectedAgent
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
                    onClose: {
                        launchedDeployment = nil
                    },
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
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                launchHeaderCard

            if showCloneWarning {
                launchCard {
                    LaunchNoticeRow(
                        title: "Fresh Clone Required",
                        subtitle: "This repository has no local clone. issuectl will create one before launching.",
                        systemImage: "exclamationmark.triangle.fill",
                        tint: .orange
                    )
                }
            }

            if let existingDeployment {
                launchCard {
                    ExistingSessionCard(
                        deployment: existingDeployment,
                        onOpen: { openExistingTerminal(existingDeployment) }
                    )
                }
            }

            if dirtyWorktree {
                launchCard {
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

                VStack(alignment: .leading, spacing: 8) {
                    LaunchSectionHeader(title: "Ready Check", systemImage: "checklist")
                    launchChecklist
                }

                launchCard {
                DisclosureGroup(isExpanded: $showAdvancedOptions) {
                    VStack(alignment: .leading, spacing: 18) {
                        workspaceOptions
                        agentOptions
                        branchOptions
                        commentOptions
                        fileOptions
                        preambleOptions
                    }
                    .padding(.top, 8)
                } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Label("Advanced Options", systemImage: "slider.horizontal.3")
                            .font(.subheadline.weight(.semibold))
                        Text("Change workspace, agent, branch, context, or instructions.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityIdentifier("launch-advanced-options")
            }

            if let errorMessage {
                launchCard {
                    Label(errorMessage, systemImage: "exclamationmark.triangle")
                        .font(.subheadline)
                        .foregroundStyle(.red)
                }
            }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 72)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Launch")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            launchBottomBar
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Cancel") { dismiss() }
                    .accessibilityIdentifier("launch-cancel-button")
            }
        }
        .task {
            await loadLaunchAgentSetting()
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

    private var launchHeaderCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: existingDeployment == nil ? "play.circle.fill" : "terminal.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(IssueCTLColors.action)
                    .frame(width: 34, height: 34)
                    .background(IssueCTLColors.action.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))

                VStack(alignment: .leading, spacing: 4) {
                    Text(existingDeployment == nil ? "Ready to Launch \(selectedAgent.displayName)" : "Session Already Running")
                        .font(.headline)
                    Text("#\(issueNumber) \(issueTitle)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }

            Text(existingDeployment == nil ? "Confirm the checklist, then start the agent." : "Open the existing terminal instead of launching a duplicate session.")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius))
        .overlay {
            RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
        .accessibilityElement(children: .combine)
    }

    private func launchCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius))
            .overlay {
                RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius)
                    .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
            }
    }

    private var launchChecklist: some View {
        VStack(spacing: 10) {
            LaunchChecklistRow(
                title: "Workspace",
                value: workspaceSummary,
                systemImage: "folder.badge.gearshape",
                isReady: !showCloneWarning
            )

            LaunchChecklistRow(
                title: "Branch",
                value: branchName.isEmpty ? "Branch name required" : branchName,
                systemImage: "point.topleft.down.curvedto.point.bottomright.up",
                isReady: !branchName.isEmpty
            )

            LaunchChecklistRow(
                title: "Context",
                value: contextSummary,
                systemImage: "text.bubble",
                isReady: true
            )

            LaunchChecklistRow(
                title: "Instructions",
                value: preamble.isEmpty ? "No extra preamble" : "Custom preamble included",
                systemImage: "doc.text",
                isReady: true
            )
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var launchBottomBar: some View {
        VStack(spacing: 8) {
            if let existingDeployment {
                launchActionButton(
                    title: existingDeployment.ttydPort == nil ? "Terminal Starting" : "Re-enter Running Terminal",
                    systemImage: "terminal",
                    isDisabled: existingDeployment.ttydPort == nil
                ) {
                    openExistingTerminal(existingDeployment)
                }
                .accessibilityIdentifier("launch-reenter-terminal-button")
            } else {
                launchButton
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 10)
        .background(.regularMaterial)
        .overlay(alignment: .top) {
            Divider()
        }
    }

    private var launchButton: some View {
        launchActionButton(
            title: "Launch \(selectedAgent.displayName)",
            systemImage: "play.fill",
            isDisabled: branchName.isEmpty || isLaunching || isLoadingLaunchSettings || isCheckingActiveSession
        ) {
            Task { await launchSession() }
        }
        .accessibilityIdentifier("launch-recommended-button")
    }

    private func launchActionButton(
        title: String,
        systemImage: String,
        isDisabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isLaunching || isLoadingLaunchSettings || isCheckingActiveSession {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                } else {
                    Image(systemName: systemImage)
                        .font(.subheadline.weight(.bold))
                }
                Text(title)
                    .font(.subheadline.weight(.bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(IssueCTLColors.action.opacity(isDisabled ? 0.45 : 1), in: RoundedRectangle(cornerRadius: 16))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
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

    private var workspaceSummary: String {
        switch workspaceMode {
        case .worktree:
            return showCloneWarning ? "Fresh clone required" : "New worktree"
        case .existing:
            return "Use existing checkout"
        case .clone:
            return "Fresh clone"
        }
    }

    private var contextSummary: String {
        var parts: [String] = []
        if !comments.isEmpty {
            parts.append(selectedCommentIndices.isEmpty ? "No comments" : "\(selectedCommentIndices.count) comments")
        }
        if !referencedFiles.isEmpty {
            parts.append(selectedFilePaths.isEmpty ? "No files" : "\(selectedFilePaths.count) files")
        }
        return parts.isEmpty ? "Issue title and body" : parts.joined(separator: " - ")
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

    private var agentOptions: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Agent")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Picker("Agent", selection: $selectedAgent) {
                ForEach(LaunchAgent.allCases) { agent in
                    Text(agent.displayName).tag(agent)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("launch-agent-picker")
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
                HStack {
                    Text("Include Comments")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button(selectedCommentIndices.count == comments.count ? "Clear" : "All") {
                        if selectedCommentIndices.count == comments.count {
                            selectedCommentIndices.removeAll()
                        } else {
                            selectedCommentIndices = Set(comments.indices)
                        }
                    }
                    .font(.caption.weight(.semibold))
                }
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
                HStack {
                    Text("Include Files")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button(selectedFilePaths.count == referencedFiles.count ? "Clear" : "All") {
                        if selectedFilePaths.count == referencedFiles.count {
                            selectedFilePaths.removeAll()
                        } else {
                            selectedFilePaths = Set(referencedFiles)
                        }
                    }
                    .font(.caption.weight(.semibold))
                }
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

    private func loadLaunchAgentSetting() async {
        isLoadingLaunchSettings = true
        defer { isLoadingLaunchSettings = false }
        do {
            let settings = try await api.getSettings()
            selectedAgent = LaunchAgent.settingValue(settings["launch_agent"])
        } catch {
            selectedAgent = .claude
        }
    }

    private func loadExistingDeployment() async {
        isCheckingActiveSession = true
        defer { isCheckingActiveSession = false }
        do {
            existingDeployment = try await findExistingDeployment()
            if let existingDeployment {
                onSessionAvailable(existingDeployment)
            }
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
                onSessionAvailable(existing)
                openExistingTerminal(existing)
                return
            }

            withAnimation { showProgress = true }

            let body = LaunchRequestBody(
                agent: selectedAgent,
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
                onSessionAvailable(deployment)
                launchedDeployment = deployment
            } else {
                errorMessage = response.error ?? "Launch failed"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct LaunchSectionHeader: View {
    let title: String
    let systemImage: String

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.headline)
            .foregroundStyle(.primary)
            .accessibilityAddTraits(.isHeader)
    }
}

private struct LaunchChecklistRow: View {
    let title: String
    let value: String
    let systemImage: String
    let isReady: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: isReady ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(isReady ? .green : .orange)
                .frame(width: 24, height: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(value)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer(minLength: 8)

            Image(systemName: systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
                .padding(.top, 3)
        }
        .padding(10)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct LaunchNoticeRow: View {
    let title: String
    let subtitle: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 28, height: 28)
                .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct ExistingSessionCard: View {
    let deployment: ActiveDeployment
    let onOpen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "terminal.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.blue)
                    .frame(width: 28, height: 28)
                    .background(Color.blue.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))

                VStack(alignment: .leading, spacing: 3) {
                    Text(deployment.ttydPort == nil ? "Terminal Starting" : "Terminal Running")
                        .font(.subheadline.weight(.semibold))
                    Text("\(deployment.branchName) - \(deployment.runningDuration)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                Spacer(minLength: 0)
            }

            Button {
                onOpen()
            } label: {
                Label(deployment.ttydPort == nil ? "Terminal Starting" : "Open Existing Terminal", systemImage: "terminal")
                    .font(.caption.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(deployment.ttydPort == nil)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}
