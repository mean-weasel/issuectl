import SwiftUI

struct EditRepoSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss
    let repo: Repo
    var onUpdated: (Repo) -> Void

    @State private var currentRepo: Repo
    @State private var localPath: String
    @State private var branchPattern: String
    @State private var autoLaunchIssues: Bool
    @State private var autoReviewPrs: Bool
    @State private var issueAgent: LaunchAgent
    @State private var reviewAgent: LaunchAgent
    @State private var webhookPayloadMode: WebhookPayloadMode
    @State private var reviewPreamble: String
    @State private var webhookHealth: WebhookAutomationHealth?
    @State private var isSaving = false
    @State private var isCheckingWebhookSessions = false
    @State private var isCheckingWebhookHealth = false
    @State private var isConfiguringWebhook = false
    @State private var isRecreatingLabels = false
    @State private var errorMessage: String?
    @State private var actionMessage: String?
    @State private var actionError: String?
    @State private var showDisableAutomationConfirm = false

    init(repo: Repo, onUpdated: @escaping (Repo) -> Void) {
        self.repo = repo
        self.onUpdated = onUpdated
        _currentRepo = State(initialValue: repo)
        _localPath = State(initialValue: repo.localPath ?? "")
        _branchPattern = State(initialValue: repo.branchPattern ?? "")
        _autoLaunchIssues = State(initialValue: repo.autoLaunchIssues)
        _autoReviewPrs = State(initialValue: repo.autoReviewPrs)
        _issueAgent = State(initialValue: repo.issueAgent)
        _reviewAgent = State(initialValue: repo.reviewAgent)
        _webhookPayloadMode = State(initialValue: repo.webhookPayloadMode)
        _reviewPreamble = State(initialValue: repo.reviewPreamble ?? "")
    }

    private var hasChanges: Bool {
        let currentPath = trimmedLocalPath
        let currentPattern = trimmedBranchPattern
        let originalPath = repo.localPath ?? ""
        let originalPattern = repo.branchPattern ?? ""
        let originalPreamble = repo.reviewPreamble?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return currentPath != originalPath
            || currentPattern != originalPattern
            || autoLaunchIssues != repo.autoLaunchIssues
            || autoReviewPrs != repo.autoReviewPrs
            || issueAgent != repo.issueAgent
            || reviewAgent != repo.reviewAgent
            || webhookPayloadMode != repo.webhookPayloadMode
            || trimmedReviewPreamble != originalPreamble
    }

    private var trimmedLocalPath: String {
        localPath.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedBranchPattern: String {
        branchPattern.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedReviewPreamble: String {
        reviewPreamble.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isSaveBusy: Bool {
        isSaving || isCheckingWebhookSessions
    }

    private var disablesWebhookAutomation: Bool {
        (repo.autoLaunchIssues && !autoLaunchIssues) || (repo.autoReviewPrs && !autoReviewPrs)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    EditRepoStatusCard(
                        fullName: repo.fullName,
                        localPath: localPath.trimmingCharacters(in: .whitespacesAndNewlines),
                        branchPattern: branchPattern.trimmingCharacters(in: .whitespacesAndNewlines)
                    )
                }
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 8, trailing: 16))
                .listRowBackground(Color.clear)

                Section {
                    TextField("Local path", text: $localPath)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .textContentType(.URL)
                } header: {
                    Text("Local Path")
                } footer: {
                    Text("Absolute path to the local git clone. Sessions use this path for worktrees and terminal launch.")
                }

                Section {
                    TextField("Branch pattern", text: $branchPattern)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("Branch Pattern")
                } footer: {
                    Text("Pattern for naming branches (e.g. feature/{{number}}-{{slug}}).")
                }

                automationSection
                webhookSection

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Edit Repository")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaveBusy {
                        ProgressView()
                    } else {
                        Button("Save") {
                            Task { await requestSave() }
                        }
                        .disabled(!hasChanges)
                        .accessibilityIdentifier("edit-repo-save-button")
                    }
                }
            }
            .confirmationDialog(
                "Active Webhook Sessions",
                isPresented: $showDisableAutomationConfirm,
                titleVisibility: .visible
            ) {
                Button("Save Changes", role: .destructive) {
                    Task { await save() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Webhook-triggered sessions are still running for this repo. Saving will stop future automation only; it will not end existing sessions.")
            }
            .interactiveDismissDisabled(isSaveBusy)
        }
    }

    private var automationSection: some View {
        Section {
            Toggle("Auto-launch issues", isOn: $autoLaunchIssues)
                .accessibilityIdentifier("edit-repo-auto-launch-toggle")

            Picker("Issue agent", selection: $issueAgent) {
                ForEach(LaunchAgent.allCases) { agent in
                    Text(agent.displayName).tag(agent)
                }
            }
            .accessibilityIdentifier("edit-repo-issue-agent-picker")

            Toggle("Auto-review PRs", isOn: $autoReviewPrs)
                .accessibilityIdentifier("edit-repo-auto-review-toggle")

            Picker("Review agent", selection: $reviewAgent) {
                ForEach(LaunchAgent.allCases) { agent in
                    Text(agent.displayName).tag(agent)
                }
            }
            .accessibilityIdentifier("edit-repo-review-agent-picker")

            Picker("Webhook payload", selection: $webhookPayloadMode) {
                ForEach(WebhookPayloadMode.allCases, id: \.self) { mode in
                    Text(mode.settingsTitle).tag(mode)
                }
            }
            .accessibilityIdentifier("edit-repo-webhook-payload-picker")

            TextField("Review preamble", text: $reviewPreamble, axis: .vertical)
                .lineLimit(2...5)
                .autocorrectionDisabled()
                .accessibilityIdentifier("edit-repo-review-preamble-field")
        } header: {
            Text("Automation")
        } footer: {
            Text("Issue automation launches work sessions from labels. PR automation prepares review sessions from webhook labels.")
        }
    }

    private var webhookSection: some View {
        Section {
            WebhookStatusSummary(repo: currentRepo, health: webhookHealth)

            Button {
                Task { await checkWebhookHealth() }
            } label: {
                settingsActionLabel(
                    title: "Check Webhook Health",
                    systemImage: "waveform.path.ecg",
                    isLoading: isCheckingWebhookHealth
                )
            }
            .disabled(isCheckingWebhookHealth)
            .accessibilityIdentifier("edit-repo-webhook-health-button")

            Button {
                Task { await configureWebhook() }
            } label: {
                settingsActionLabel(
                    title: currentRepo.webhookId == nil ? "Install Webhook" : "Rotate Webhook",
                    systemImage: "dot.radiowaves.left.and.right",
                    isLoading: isConfiguringWebhook
                )
            }
            .disabled(isConfiguringWebhook)
            .accessibilityIdentifier("edit-repo-webhook-configure-button")

            Button {
                Task { await recreateLabels() }
            } label: {
                settingsActionLabel(
                    title: "Recreate Automation Labels",
                    systemImage: "tag",
                    isLoading: isRecreatingLabels
                )
            }
            .disabled(isRecreatingLabels)
            .accessibilityIdentifier("edit-repo-recreate-labels-button")

            if let actionMessage {
                Label(actionMessage, systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .font(.caption)
            }

            if let actionError {
                Label(actionError, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                    .font(.caption)
            }
        } header: {
            Text("Webhook")
        } footer: {
            Text("Health checks are on demand so Settings stays quick when GitHub is slow.")
        }
    }

    private func settingsActionLabel(title: String, systemImage: String, isLoading: Bool) -> some View {
        HStack {
            Label(title, systemImage: systemImage)
            Spacer()
            if isLoading {
                ProgressView()
            }
        }
    }

    private func requestSave() async {
        actionMessage = nil
        actionError = nil

        if disablesWebhookAutomation, await hasActiveWebhookSessions() {
            showDisableAutomationConfirm = true
            return
        }

        await save()
    }

    private func hasActiveWebhookSessions() async -> Bool {
        isCheckingWebhookSessions = true
        defer { isCheckingWebhookSessions = false }

        do {
            let response = try await api.activeDeployments(refresh: true)
            return response.deployments.contains { deployment in
                deployment.repoId == currentRepo.id
                    && deployment.triggeredBy == .webhook
                    && deployment.isActive
            }
        } catch {
            actionError = "Could not check active webhook sessions: \(error.localizedDescription)"
            return true
        }
    }

    private func save() async {
        let trimmedPath = trimmedLocalPath
        let trimmedPattern = trimmedBranchPattern

        isSaving = true
        errorMessage = nil
        actionError = nil
        defer { isSaving = false }

        do {
            let updated = try await api.updateRepo(
                owner: repo.owner,
                name: repo.name,
                localPath: trimmedPath,
                branchPattern: trimmedPattern,
                autoLaunchIssues: autoLaunchIssues,
                autoReviewPrs: autoReviewPrs,
                issueAgent: issueAgent,
                reviewAgent: reviewAgent,
                reviewPreamble: trimmedReviewPreamble,
                webhookPayloadMode: webhookPayloadMode
            )
            currentRepo = updated
            onUpdated(updated)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func checkWebhookHealth() async {
        isCheckingWebhookHealth = true
        actionMessage = nil
        actionError = nil
        defer { isCheckingWebhookHealth = false }

        do {
            webhookHealth = try await api.webhookHealth(owner: currentRepo.owner, repo: currentRepo.name)
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func configureWebhook() async {
        isConfiguringWebhook = true
        actionMessage = nil
        actionError = nil
        defer { isConfiguringWebhook = false }

        let action: WebhookAction = currentRepo.webhookId == nil ? .create : .rotate

        do {
            let response = try await api.configureWebhook(owner: currentRepo.owner, repo: currentRepo.name, action: action)
            if let updated = response.repo {
                currentRepo = updated
                onUpdated(updated)
            }
            actionMessage = action == .create ? "Webhook installed." : "Webhook rotated."
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func recreateLabels() async {
        isRecreatingLabels = true
        actionMessage = nil
        actionError = nil
        defer { isRecreatingLabels = false }

        do {
            let response = try await api.recreateRepoLabels(owner: currentRepo.owner, repo: currentRepo.name)
            if response.success {
                actionMessage = "Automation labels recreated."
            } else {
                actionError = response.error ?? "Failed to recreate automation labels."
            }
        } catch {
            actionError = error.localizedDescription
        }
    }
}

private struct WebhookStatusSummary: View {
    let repo: Repo
    let health: WebhookAutomationHealth?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .foregroundStyle(tint)
                    .frame(width: 26)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if let detail = health?.detail, !detail.isEmpty {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let recovery = health?.recovery, !recovery.isEmpty {
                Text(recovery)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityIdentifier("edit-repo-webhook-status")
    }

    private var title: String {
        health?.summary ?? (repo.webhookId == nil ? "Webhook not installed" : "Webhook installed")
    }

    private var subtitle: String {
        if let expectedUrl = health?.expectedUrl {
            return expectedUrl
        }
        if let hookId = repo.webhookId {
            return "GitHub hook #\(hookId)"
        }
        return "Install a webhook to enable automation labels."
    }

    private var icon: String {
        if let health {
            return health.isOK ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
        }
        return repo.webhookId == nil ? "dot.radiowaves.left.and.right" : "checkmark.circle.fill"
    }

    private var tint: Color {
        if let health {
            return health.isOK ? .green : .orange
        }
        return repo.webhookId == nil ? .secondary : .green
    }
}

private extension WebhookPayloadMode {
    var settingsTitle: String {
        switch self {
        case .metadata:
            return "Metadata"
        case .raw:
            return "Raw payload"
        }
    }
}

private struct EditRepoStatusCard: View {
    let fullName: String
    let localPath: String
    let branchPattern: String

    private var hasLocalPath: Bool {
        !localPath.isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: hasLocalPath ? "folder.badge.gearshape" : "folder.badge.questionmark")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(hasLocalPath ? IssueCTLColors.action : .orange)
                    .frame(width: 40, height: 40)
                    .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10))

                VStack(alignment: .leading, spacing: 4) {
                    Text(fullName)
                        .font(.headline)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Text(hasLocalPath ? "Ready for local sessions." : "Add a local clone path to enable smoother launches.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                RepoSetupRow(title: "Local clone", value: hasLocalPath ? localPath : "Missing", isComplete: hasLocalPath)
                RepoSetupRow(title: "Branch pattern", value: branchPattern.isEmpty ? "Default" : branchPattern, isComplete: true)
            }
        }
        .padding(14)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct RepoSetupRow: View {
    let title: String
    let value: String
    let isComplete: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: isComplete ? "checkmark.circle.fill" : "exclamationmark.circle")
                .font(.caption.weight(.semibold))
                .foregroundStyle(isComplete ? .green : .orange)
            Text(title)
                .font(.caption.weight(.semibold))
            Spacer(minLength: 8)
            Text(value)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
        }
    }
}
