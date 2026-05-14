import SwiftUI

struct MacIssueDetailView: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    let item: MacIssueListItem
    let store: MacSidebarStore

    @State private var detail: IssueDetailResponse?
    @State private var priority: Priority = .normal
    @State private var committedPriority: Priority = .normal
    @State private var commentBody = ""
    @State private var isLoading = true
    @State private var isRefreshing = false
    @State private var isSubmittingComment = false
    @State private var isUploadingCommentImage = false
    @State private var isUpdatingState = false
    @State private var isUpdatingPriority = false
    @State private var isLaunching = false
    @State private var activeSession: ActiveDeployment?
    @State private var currentUserLogin: String?
    @State private var errorMessage: String?
    @State private var successMessage: String?
    @State private var activeSheet: MacIssueDetailSheet?
    @State private var lightboxImage: MacLightboxImage?
    @State private var isShowingCloseWithComment = false
    @State private var commentPendingDeletion: GitHubComment?
    @State private var selectedLinkedPullRequest: MacPullRequestListItem?
    @State private var isShowingLaunchOptions = false

    private var issue: GitHubIssue {
        detail?.issue ?? item.issue
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()

            if isLoading && detail == nil {
                ProgressView("Loading issue...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage, detail == nil {
                ContentUnavailableView {
                    Label("Could not load issue", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button {
                        Task { await load(refresh: true) }
                    } label: {
                        if isRefreshing {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Label("Retry", systemImage: "arrow.clockwise")
                        }
                    }
                    .disabled(isRefreshing)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(spacing: 0) {
                    actionBar
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                    Divider()
                    if let detail {
                        cacheIndicator(for: detail)
                    }

                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            issueSummary
                            issueBody
                            commentComposer
                            launchSection
                            linkedPullRequests
                            deploymentsSection
                            comments
                        }
                        .padding(16)
                    }
                }
            }
        }
        .frame(minWidth: 520, idealWidth: 620, minHeight: 560, idealHeight: 720)
        .task {
            await load(refresh: false)
        }
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .editIssue:
                MacEditIssueSheet(issue: issue, owner: item.repo.owner, repo: item.repo.name) { title, body in
                    try await store.updateIssue(api: api, item: item, title: title, body: body)
                    await load(refresh: true)
                    activeSheet = nil
                }
            case .closeWithComment:
                EmptyView()
            case .editComment(let comment):
                MacEditCommentSheet(comment: comment, owner: item.repo.owner, repo: item.repo.name) { body in
                    try await store.editComment(api: api, item: item, commentId: comment.id, body: body)
                    await load(refresh: true)
                    activeSheet = nil
                }
            case .labels:
                MacLabelManagementSheet(issue: issue) {
                    try await store.repoLabels(api: api, item: item)
                } onToggle: { label, action in
                    try await store.toggleLabel(api: api, item: item, label: label, action: action)
                    await refreshAfterManagementAction()
                }
            case .assignees:
                MacAssigneeManagementSheet(issue: issue) {
                    try await store.collaborators(api: api, item: item)
                } onUpdate: { assignees in
                    _ = try await store.updateAssignees(api: api, item: item, assignees: assignees)
                    await refreshAfterManagementAction()
                }
            case .reassign:
                MacReassignIssueSheet(
                    issue: issue,
                    sourceRepo: item.repo,
                    repos: store.repos
                ) { target in
                    let response = try await store.reassignIssue(api: api, item: item, target: target)
                    await store.load(api: api, refresh: true)
                    let owner = response.newOwner ?? target.owner
                    let repo = response.newRepo ?? target.name
                    let number = response.newIssueNumber.map(String.init) ?? "?"
                    successMessage = "Reassigned to \(owner)/\(repo)#\(number)"
                    activeSheet = nil
                }
            }
        }
        .sheet(item: $selectedLinkedPullRequest) { pullRequest in
            MacPullRequestDetailView(item: pullRequest, store: store)
        }
        .sheet(isPresented: $isShowingLaunchOptions) {
            MacLaunchOptionsSheet(
                item: item,
                detail: detail,
                initialOptions: MacIssueLaunchOptions.defaults(for: item, detail: detail, settings: nil)
            ) { options in
                await launchIssue(options: options, openTerminalWhenReady: true)
            }
            .environment(api)
        }
        .sheet(item: $lightboxImage) { image in
            MacImageLightbox(url: image.url, altText: image.altText) {
                lightboxImage = nil
            }
        }
        .sheet(isPresented: $isShowingCloseWithComment) {
            MacCloseIssueSheet(issueNumber: issue.number, owner: item.repo.owner, repo: item.repo.name) { comment in
                try await store.updateIssueState(api: api, item: item, state: "closed", comment: comment)
                await load(refresh: true)
                isShowingCloseWithComment = false
            }
        }
        .confirmationDialog(
            "Delete Comment",
            isPresented: .init(
                get: { commentPendingDeletion != nil },
                set: { if !$0 { commentPendingDeletion = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                if let comment = commentPendingDeletion {
                    Task { await deleteComment(comment) }
                }
            }
            Button("Cancel", role: .cancel) {
                commentPendingDeletion = nil
            }
        } message: {
            Text("This cannot be undone.")
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.repoFullName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("#\(issue.number)")
                    .font(.headline)
            }

            Spacer()

            Button {
                Task { await load(refresh: true) }
            } label: {
                if isRefreshing {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Image(systemName: "arrow.clockwise")
                }
            }
            .buttonStyle(.borderless)
            .disabled(isRefreshing)
            .help("Refresh")

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
            }
            .buttonStyle(.borderless)
            .accessibilityIdentifier("mac-issue-detail-close-button")
            .help("Close")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var issueSummary: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(issue.title)
                .font(.title3.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                MacStateBadge(isOpen: issue.isOpen)
                MacPriorityBadge(priority: priority)

                if let user = issue.user {
                    Label(user.login, systemImage: "person")
                        .labelStyle(.titleAndIcon)
                }

                if !issue.timeAgo.isEmpty {
                    Text(issue.timeAgo)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if !issue.labels.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(issue.labels) { label in
                            Text(label.name)
                                .font(.caption.weight(.medium))
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(Color.secondary.opacity(0.12), in: Capsule())
                        }
                    }
                }
            }

            if let assignees = issue.assignees, !assignees.isEmpty {
                Text("Assigned to \(assignees.map(\.login).joined(separator: ", "))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("mac-issue-detail-error-message")
            }

            if let successMessage {
                Label(successMessage, systemImage: "checkmark.circle")
                    .font(.caption)
                    .foregroundStyle(.green)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("mac-issue-detail-success-message")
            }
        }
    }

    private var launchSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Divider()

            HStack(alignment: .center, spacing: 10) {
                Image(systemName: sessionIcon)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(sessionTint)
                    .frame(width: 30, height: 30)
                    .background(sessionTint.opacity(0.12), in: RoundedRectangle(cornerRadius: 7))

                VStack(alignment: .leading, spacing: 3) {
                    Text(sessionTitle)
                        .font(.subheadline.weight(.semibold))
                    Text(sessionSubtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                Spacer()

                if let activeSession {
                    Button {
                        openTerminal(activeSession)
                    } label: {
                        Label(activeSession.ttydPort == nil ? "Starting" : "Open", systemImage: "terminal")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(activeSession.ttydPort == nil)
                } else {
                    HStack(spacing: 8) {
                        Button {
                            Task { await launchIssue(options: nil, openTerminalWhenReady: true) }
                        } label: {
                            if isLaunching {
                                ProgressView()
                                    .controlSize(.small)
                            } else {
                                Label("Launch", systemImage: "play.fill")
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(isLaunching || !issue.isOpen)
                        .accessibilityIdentifier("mac-issue-detail-launch-button")

                        Button {
                            isShowingLaunchOptions = true
                        } label: {
                            Label("Options", systemImage: "slider.horizontal.3")
                        }
                        .buttonStyle(.bordered)
                        .disabled(isLaunching || !issue.isOpen)
                        .accessibilityIdentifier("mac-issue-detail-launch-options-button")
                    }
                }
            }
            .padding(10)
            .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
        }
    }

    private var actionBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Button {
                    activeSheet = .editIssue
                } label: {
                    Label("Edit", systemImage: "pencil")
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("mac-issue-detail-edit-button")

                Button {
                    activeSheet = .labels
                } label: {
                    Label("Labels", systemImage: "tag")
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("mac-issue-detail-labels-button")

                Button {
                    activeSheet = .assignees
                } label: {
                    Label("Assignees", systemImage: "person.2")
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("mac-issue-detail-assignees-button")

                Button {
                    activeSheet = .reassign
                } label: {
                    Label("Reassign", systemImage: "arrow.triangle.swap")
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("mac-issue-detail-reassign-button")

                Button {
                    Task { await updateState(issue.isOpen ? "closed" : "open") }
                } label: {
                    if isUpdatingState {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label(issue.isOpen ? "Close" : "Reopen", systemImage: issue.isOpen ? "xmark.circle" : "arrow.uturn.backward.circle")
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(issue.isOpen ? .red : .green)
                .disabled(isUpdatingState)
                .accessibilityIdentifier("mac-issue-detail-toggle-state-button")

                if issue.isOpen {
                    Button {
                        activeSheet = nil
                        isShowingCloseWithComment = true
                    } label: {
                        Label("Close With Comment", systemImage: "text.bubble")
                    }
                    .buttonStyle(.bordered)
                    .disabled(isUpdatingState)
                    .accessibilityIdentifier("mac-issue-detail-close-with-comment-button")
                }

                Picker("Priority", selection: $priority) {
                    ForEach(Priority.allCases, id: \.self) { priority in
                        Text(priority.rawValue.capitalized).tag(priority)
                    }
                }
                .pickerStyle(.menu)
                .disabled(isUpdatingPriority)
                .onChange(of: priority) { oldValue, newValue in
                    guard oldValue != newValue else { return }
                    guard newValue != committedPriority else { return }
                    Task { await setPriority(newValue, rollbackTo: oldValue) }
                }

                Button {
                    if let url = URL(string: issue.htmlUrl) {
                        openURL(url)
                    }
                } label: {
                    Label("GitHub", systemImage: "safari")
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("mac-issue-detail-github-button")
            }
        }
    }

    private var sessionTitle: String {
        if let activeSession {
            return activeSession.ttydPort == nil ? "Session Starting" : "Session Active"
        }
        return issue.isOpen ? "Ready to Launch" : "Issue Closed"
    }

    private var sessionSubtitle: String {
        if let activeSession {
            let terminalState = activeSession.ttydPort.map { "port \($0)" } ?? "terminal preparing"
            return "\(activeSession.branchName) - \(terminalState)"
        }
        return issue.isOpen ? "Start an agent session with the shared launch settings." : "Reopen the issue before launching."
    }

    private var sessionIcon: String {
        if let activeSession {
            return activeSession.ttydPort == nil ? "hourglass" : "terminal"
        }
        return issue.isOpen ? "play.circle.fill" : "checkmark.circle.fill"
    }

    private var sessionTint: Color {
        if let activeSession {
            return activeSession.ttydPort == nil ? .orange : .green
        }
        return issue.isOpen ? .blue : .purple
    }

    @ViewBuilder
    private var issueBody: some View {
        if let body = issue.body, !body.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Divider()
                Text("Description")
                    .font(.headline)
                    .accessibilityIdentifier("mac-issue-detail-body-markdown")
                MacMarkdownView(content: body, accessibilityPrefix: "mac-issue-body") { image in
                    lightboxImage = image
                }
            }
        }
    }

    private var commentComposer: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            Text("Comment")
                .font(.headline)

            TextEditor(text: $commentBody)
                .font(.body)
                .frame(minHeight: 90)
                .overlay {
                    RoundedRectangle(cornerRadius: 7)
                        .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
                }
                .accessibilityIdentifier("mac-comment-composer-body-field")

            MacImageAttachmentButton(
                owner: item.repo.owner,
                repo: item.repo.name,
                accessibilityPrefix: "mac-comment-composer",
                isUploading: $isUploadingCommentImage
            ) { markdown in
                appendMarkdown(markdown, to: &commentBody)
            }

            HStack {
                Spacer()
                Button {
                    Task { await submitComment() }
                } label: {
                    if isSubmittingComment {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label("Add Comment", systemImage: "bubble.left.and.bubble.right")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(commentBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmittingComment || isUploadingCommentImage)
                .accessibilityIdentifier("mac-comment-composer-submit-button")
            }
        }
    }

    @ViewBuilder
    private var comments: some View {
        if let comments = detail?.comments, !comments.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Divider()
                Text("\(comments.count) Comment\(comments.count == 1 ? "" : "s")")
                    .font(.headline)

                ForEach(comments) { comment in
                    VStack(alignment: .leading, spacing: 5) {
                        HStack {
                            Text(comment.user?.login ?? "Unknown")
                                .font(.subheadline.weight(.semibold))
                            Spacer()
                            if let updatedAt = parseIssueCTLDate(comment.updatedAt) {
                                Text(updatedAt, style: .relative)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        MacMarkdownView(content: comment.body, accessibilityPrefix: "mac-comment-\(comment.id)") { image in
                            lightboxImage = image
                        }

                        if isOwnComment(comment) {
                            HStack(spacing: 8) {
                                Spacer()
                                Button {
                                    activeSheet = .editComment(comment)
                                } label: {
                                    Label("Edit", systemImage: "pencil")
                                }
                                .buttonStyle(.borderless)
                                .accessibilityIdentifier("mac-issue-detail-edit-comment-\(comment.id)")

                                Button(role: .destructive) {
                                    commentPendingDeletion = comment
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                                .buttonStyle(.borderless)
                                .accessibilityIdentifier("mac-issue-detail-delete-comment-\(comment.id)")
                            }
                            .font(.caption)
                        }
                    }
                    .padding(10)
                    .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("mac-issue-detail-comment-\(comment.id)")
                }
            }
        }
    }

    @ViewBuilder
    private var linkedPullRequests: some View {
        if let linkedPRs = detail?.linkedPRs, !linkedPRs.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Divider()
                Text("Linked Pull Requests")
                    .font(.headline)

                ForEach(linkedPRs) { pr in
                    Button {
                        selectedLinkedPullRequest = MacPullRequestListItem(pull: pr, repo: item.repo, repoIndex: item.repoIndex)
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: pr.isOpen ? "arrow.triangle.merge" : (pr.merged ? "checkmark.circle.fill" : "xmark.circle"))
                                .foregroundStyle(pr.isOpen ? .green : (pr.merged ? .purple : .red))
                            Text("#\(pr.number)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(pr.title)
                                .font(.subheadline)
                                .lineLimit(1)
                            Spacer()
                            Text(pr.diffSummary)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("mac-issue-detail-linked-pr-\(pr.number)")
                }
            }
        }
    }

    @ViewBuilder
    private var deploymentsSection: some View {
        if let deployments = detail?.deployments, !deployments.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Divider()
                Text("Sessions")
                    .font(.headline)

                ForEach(deployments) { deployment in
                    HStack(spacing: 8) {
                        Circle()
                            .fill(deployment.isActive ? .green : .secondary)
                            .frame(width: 8, height: 8)
                        Text(deployment.branchName)
                            .font(.subheadline)
                        Spacer()
                        if deployment.isActive, deployment.ttydPort != nil {
                            Button {
                                openTerminal(activeDeployment(from: deployment))
                            } label: {
                                Label("Open", systemImage: "terminal")
                            }
                            .buttonStyle(.borderless)
                            .accessibilityIdentifier("mac-issue-detail-open-session-\(deployment.id)")
                        } else {
                            Text(deployment.isActive ? deployment.state.rawValue : "ended")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .accessibilityIdentifier("mac-issue-detail-deployment-\(deployment.id)")
                }
            }
        }
    }

    private func load(refresh: Bool) async {
        if refresh {
            isRefreshing = true
        } else {
            isLoading = true
        }
        errorMessage = nil
        defer {
            isLoading = false
            isRefreshing = false
        }

        do {
            successMessage = nil
            async let detailResult = store.issueDetail(api: api, item: item, refresh: refresh)
            async let userResult: Result<UserResponse, Error> = {
                do { return .success(try await api.currentUser(refresh: refresh)) }
                catch { return .failure(error) }
            }()
            async let priorityResult: Result<Priority, Error> = {
                do { return .success(try await api.getPriority(owner: item.repo.owner, repo: item.repo.name, number: item.issue.number)) }
                catch { return .failure(error) }
            }()

            detail = try await detailResult
            await store.refreshSessions(api: api)
            activeSession = store.activeSession(for: item)
            switch await userResult {
            case .success(let user):
                currentUserLogin = user.login
            case .failure:
                currentUserLogin = nil
            }
            switch await priorityResult {
            case .success(let loadedPriority):
                priority = loadedPriority
                committedPriority = loadedPriority
            case .failure:
                priority = .normal
                committedPriority = .normal
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @ViewBuilder
    private func cacheIndicator(for detail: IssueDetailResponse) -> some View {
        if detail.fromCache {
            Label(MacCacheIndicatorModel.cachedBannerText(kind: "issue detail", cachedAt: detail.cachedAt), systemImage: "externaldrive.badge.clock")
                .font(.caption)
                .foregroundStyle(.orange)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color.orange.opacity(0.10))
                .accessibilityIdentifier("mac-issue-detail-cached-banner")
        } else if let updatedText = MacCacheIndicatorModel.updatedText(cachedAt: detail.cachedAt) {
            Text(updatedText)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .accessibilityIdentifier("mac-issue-detail-cache-age")
        }
    }

    private func refreshAfterManagementAction() async {
        await store.load(api: api, refresh: true)
        await load(refresh: true)
    }

    private func isOwnComment(_ comment: GitHubComment) -> Bool {
        guard let currentUserLogin else { return false }
        return comment.user?.login == currentUserLogin
    }

    private func submitComment() async {
        let trimmed = commentBody.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        isSubmittingComment = true
        errorMessage = nil
        defer { isSubmittingComment = false }

        do {
            try await store.commentOnIssue(api: api, item: item, body: trimmed)
            commentBody = ""
            await load(refresh: true)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func updateState(_ state: String) async {
        isUpdatingState = true
        errorMessage = nil
        defer { isUpdatingState = false }

        do {
            try await store.updateIssueState(api: api, item: item, state: state)
            await load(refresh: true)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteComment(_ comment: GitHubComment) async {
        commentPendingDeletion = nil
        errorMessage = nil

        do {
            try await store.deleteComment(api: api, item: item, commentId: comment.id)
            await load(refresh: true)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func setPriority(_ newPriority: Priority, rollbackTo oldPriority: Priority) async {
        isUpdatingPriority = true
        errorMessage = nil
        defer { isUpdatingPriority = false }

        do {
            try await store.setPriority(api: api, item: item, priority: newPriority)
            committedPriority = newPriority
        } catch {
            priority = oldPriority
            errorMessage = error.localizedDescription
        }
    }

    @discardableResult
    private func launchIssue(options: MacIssueLaunchOptions?, openTerminalWhenReady: Bool) async -> Bool {
        isLaunching = true
        errorMessage = nil
        defer { isLaunching = false }

        do {
            let session = try await store.launchIssue(api: api, item: item, detail: detail, options: options)
            activeSession = session
            isShowingLaunchOptions = false
            if openTerminalWhenReady, session.ttydPort != nil {
                await openTerminalAsync(session)
            }
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    private func openTerminal(_ session: ActiveDeployment) {
        Task { await openTerminalAsync(session) }
    }

    private func activeDeployment(from deployment: Deployment) -> ActiveDeployment {
        ActiveDeployment(
            id: deployment.id,
            repoId: deployment.repoId,
            issueNumber: deployment.issueNumber,
            branchName: deployment.branchName,
            workspaceMode: deployment.workspaceMode,
            workspacePath: deployment.workspacePath,
            linkedPrNumber: deployment.linkedPrNumber,
            state: deployment.state,
            launchedAt: deployment.launchedAt,
            endedAt: deployment.endedAt,
            ttydPort: deployment.ttydPort,
            ttydPid: deployment.ttydPid,
            owner: item.repo.owner,
            repoName: item.repo.name
        )
    }

    @MainActor
    private func openTerminalAsync(_ session: ActiveDeployment) async {
        errorMessage = nil
        MacTerminalWindowController.open(session: session, store: store, api: api) {
            activeSession = nil
        }
    }
}

private enum MacIssueDetailSheet: Identifiable {
    case editIssue
    case closeWithComment
    case editComment(GitHubComment)
    case labels
    case assignees
    case reassign

    var id: String {
        switch self {
        case .editIssue:
            "edit-issue"
        case .closeWithComment:
            "close-with-comment"
        case .editComment(let comment):
            "edit-comment-\(comment.id)"
        case .labels:
            "labels"
        case .assignees:
            "assignees"
        case .reassign:
            "reassign"
        }
    }
}

private struct MacLaunchOptionsSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let item: MacIssueListItem
    let detail: IssueDetailResponse?
    let submit: (MacIssueLaunchOptions) async -> Bool

    @State private var options: MacIssueLaunchOptions
    @State private var isSubmitting = false
    @State private var isCheckingWorktree = false
    @State private var isResettingWorktree = false
    @State private var worktreeStatus: WorktreeStatusResponse?
    @State private var worktreeStatusError: String?
    @State private var resetMessage: String?
    @State private var resetErrorMessage: String?
    @State private var launchErrorMessage: String?

    init(
        item: MacIssueListItem,
        detail: IssueDetailResponse?,
        initialOptions: MacIssueLaunchOptions,
        submit: @escaping (MacIssueLaunchOptions) async -> Bool
    ) {
        self.item = item
        self.detail = detail
        self.submit = submit
        _options = State(initialValue: initialOptions)
    }

    private var comments: [GitHubComment] {
        detail?.comments ?? []
    }

    private var referencedFiles: [String] {
        detail?.referencedFiles ?? []
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    agentSection
                    workspaceSection
                    readinessSection
                    branchSection
                    resumeSection
                    preambleSection
                    commentsSection
                    filesSection
                }
                .padding(16)
            }

            Divider()
            footer
        }
        .frame(width: 520, height: 620)
        .task {
            await loadSavedAgent()
            await refreshWorktreeStatusIfNeeded()
        }
        .onChange(of: options.workspaceMode) {
            Task { await refreshWorktreeStatusIfNeeded() }
        }
        .onChange(of: options.resumeBehavior) {
            launchErrorMessage = nil
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Launch Options")
                .font(.headline)
            Text("\(item.repoFullName)#\(item.issue.number)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(16)
    }

    private var agentSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Agent")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Picker("Agent", selection: $options.agent) {
                ForEach(LaunchAgent.allCases) { agent in
                    Text(agent.displayName).tag(agent)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("mac-launch-options-agent-picker")
        }
    }

    private var workspaceSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Workspace")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Picker("Workspace", selection: $options.workspaceMode) {
                Text("Worktree").tag(WorkspaceMode.worktree)
                Text("Existing").tag(WorkspaceMode.existing)
                Text("Clone").tag(WorkspaceMode.clone)
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("mac-launch-options-workspace-picker")

            if item.repo.localPath?.isEmpty != false, options.workspaceMode == .worktree {
                Label("This repo has no local path, so launch will use clone mode unless a path is configured.", systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("mac-launch-options-workspace-warning")
            }
        }
    }

    @ViewBuilder
    private var readinessSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Readiness")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            if options.workspaceMode == .worktree, item.repo.localPath?.isEmpty != false {
                readinessLabel(
                    "Worktree mode needs a local repo path. Clone mode is available for this launch.",
                    systemImage: "arrow.down.doc",
                    color: .orange,
                    identifier: "mac-launch-options-fallback-explanation"
                )
            } else if options.workspaceMode == .worktree {
                if isCheckingWorktree {
                    HStack(spacing: 8) {
                        ProgressView()
                            .controlSize(.small)
                        Text("Checking worktree status...")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityIdentifier("mac-launch-options-readiness-checking")
                } else if let worktreeStatusError {
                    readinessLabel(
                        "Could not check worktree status: \(worktreeStatusError). Clone mode remains available.",
                        systemImage: "wifi.exclamationmark",
                        color: .orange,
                        identifier: "mac-launch-options-worktree-status-error"
                    )
                } else if let worktreeStatus, worktreeStatus.isDirty {
                    dirtyWorktreeCard(path: worktreeStatus.path)
                } else if let worktreeStatus, worktreeStatus.exists {
                    readinessLabel(
                        "Worktree is clean at \(worktreeStatus.path).",
                        systemImage: "checkmark.circle",
                        color: .green,
                        identifier: "mac-launch-options-readiness-summary"
                    )
                } else {
                    readinessLabel(
                        "No existing issue worktree was found. Launch can create one from the local repo.",
                        systemImage: "plus.circle",
                        color: .secondary,
                        identifier: "mac-launch-options-readiness-summary"
                    )
                }
            } else {
                readinessLabel(
                    options.workspaceMode == .clone ? "Clone mode will create a fresh checkout for this issue." : "Existing mode will use the configured local checkout.",
                    systemImage: options.workspaceMode == .clone ? "arrow.down.doc" : "folder",
                    color: .secondary,
                    identifier: "mac-launch-options-readiness-summary"
                )
            }

            if let resetMessage {
                readinessLabel(resetMessage, systemImage: "checkmark.circle", color: .green, identifier: "mac-launch-options-reset-message")
            }

            if let resetErrorMessage {
                readinessLabel(resetErrorMessage, systemImage: "exclamationmark.triangle", color: .red, identifier: "mac-launch-options-reset-error")
            }

            if let launchErrorMessage {
                readinessLabel(launchErrorMessage, systemImage: "exclamationmark.triangle", color: .red, identifier: "mac-launch-options-submit-error")
            }
        }
    }

    private func readinessLabel(_ text: String, systemImage: String, color: Color, identifier: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.caption)
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier(identifier)
    }

    private func dirtyWorktreeCard(path: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            readinessLabel(
                "Existing changes were found in \(path). Choose whether to discard them or resume with them.",
                systemImage: "exclamationmark.triangle",
                color: .orange,
                identifier: "mac-launch-options-dirty-worktree-warning"
            )

            HStack {
                Button {
                    Task { await resetWorktree() }
                } label: {
                    if isResettingWorktree {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label("Discard & Start Fresh", systemImage: "arrow.counterclockwise")
                    }
                }
                .disabled(isResettingWorktree || isSubmitting)
                .accessibilityIdentifier("mac-launch-options-reset-worktree-button")

                Button {
                    options.resumeBehavior = .resume
                    resetMessage = "Launch will resume with the existing worktree changes."
                    resetErrorMessage = nil
                    launchErrorMessage = nil
                } label: {
                    Label("Resume with Changes", systemImage: "arrow.forward.circle")
                }
                .disabled(isResettingWorktree || isSubmitting)
                .accessibilityIdentifier("mac-launch-options-resume-dirty-button")
            }
            .controlSize(.small)
        }
    }

    private var branchSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Branch")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            TextField("Branch name", text: $options.branchName)
                .textFieldStyle(.roundedBorder)
                .font(.system(.body, design: .monospaced))
                .accessibilityIdentifier("mac-launch-options-branch-field")
        }
    }

    private var resumeSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Existing Changes")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Picker("Existing changes", selection: $options.resumeBehavior) {
                ForEach(MacLaunchResumeBehavior.allCases) { behavior in
                    Text(behavior.title).tag(behavior)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("mac-launch-options-resume-picker")
        }
    }

    @ViewBuilder
    private var commentsSection: some View {
        if !comments.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Comments")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button(options.selectedCommentIndices.count == comments.count ? "Clear" : "All") {
                        if options.selectedCommentIndices.count == comments.count {
                            options.selectedCommentIndices.removeAll()
                        } else {
                            options.selectedCommentIndices = Set(comments.indices)
                        }
                    }
                    .controlSize(.small)
                    .accessibilityIdentifier("mac-launch-options-comments-toggle-all")
                }

                ForEach(Array(comments.enumerated()), id: \.offset) { index, comment in
                    Toggle(isOn: commentBinding(index)) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(comment.user?.login ?? "Unknown")
                                .font(.caption.weight(.medium))
                            Text(comment.body)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                    }
                    .toggleStyle(.checkbox)
                    .accessibilityIdentifier("mac-launch-options-comment-\(index)")
                }
            }
        }
    }

    @ViewBuilder
    private var filesSection: some View {
        if !referencedFiles.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Files")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button(options.selectedFilePaths.count == referencedFiles.count ? "Clear" : "All") {
                        if options.selectedFilePaths.count == referencedFiles.count {
                            options.selectedFilePaths.removeAll()
                        } else {
                            options.selectedFilePaths = Set(referencedFiles)
                        }
                    }
                    .controlSize(.small)
                    .accessibilityIdentifier("mac-launch-options-files-toggle-all")
                }

                ForEach(referencedFiles, id: \.self) { filePath in
                    Toggle(filePath, isOn: fileBinding(filePath))
                        .toggleStyle(.checkbox)
                        .font(.caption.monospaced())
                        .accessibilityIdentifier("mac-launch-options-file-\(filePath)")
                }
            }
        }
    }

    private var preambleSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Preamble")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            TextEditor(text: $options.preamble)
                .frame(minHeight: 90)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color.secondary.opacity(0.25))
                )
                .accessibilityIdentifier("mac-launch-options-preamble-field")
        }
    }

    private var footer: some View {
        HStack {
            Spacer()
            Button("Cancel") {
                dismiss()
            }
            .accessibilityIdentifier("mac-launch-options-cancel-button")

            Button {
                Task { await submitOptions() }
            } label: {
                if isSubmitting {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Label("Launch", systemImage: "play.fill")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(!canSubmit)
            .accessibilityIdentifier("mac-launch-options-submit-button")
        }
        .padding(16)
    }

    private var canSubmit: Bool {
        guard !isSubmitting,
              !isCheckingWorktree,
              !isResettingWorktree,
              !options.branchName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return false
        }
        if options.workspaceMode == .worktree, worktreeStatus?.isDirty == true, options.resumeBehavior != .resume {
            return false
        }
        return true
    }

    private func commentBinding(_ index: Int) -> Binding<Bool> {
        Binding(
            get: { options.selectedCommentIndices.contains(index) },
            set: { isSelected in
                if isSelected {
                    options.selectedCommentIndices.insert(index)
                } else {
                    options.selectedCommentIndices.remove(index)
                }
            }
        )
    }

    private func fileBinding(_ filePath: String) -> Binding<Bool> {
        Binding(
            get: { options.selectedFilePaths.contains(filePath) },
            set: { isSelected in
                if isSelected {
                    options.selectedFilePaths.insert(filePath)
                } else {
                    options.selectedFilePaths.remove(filePath)
                }
            }
        )
    }

    private func loadSavedAgent() async {
        guard options.agent == .claude else { return }
        if let settings = try? await api.getSettings() {
            options.agent = LaunchAgent.settingValue(settings["launch_agent"])
        }
    }

    private func submitOptions() async {
        guard !isSubmitting else { return }
        isSubmitting = true
        launchErrorMessage = nil
        var launchOptions = options
        if launchOptions.workspaceMode == .worktree, item.repo.localPath?.isEmpty != false {
            launchOptions.workspaceMode = .clone
        }
        let didLaunch = await submit(launchOptions)
        if !didLaunch {
            launchErrorMessage = "Launch failed. Adjust the options and try again."
        }
        isSubmitting = false
    }

    private func refreshWorktreeStatusIfNeeded() async {
        resetMessage = nil
        resetErrorMessage = nil
        launchErrorMessage = nil
        worktreeStatus = nil
        worktreeStatusError = nil

        guard options.workspaceMode == .worktree,
              item.repo.localPath?.isEmpty == false else {
            return
        }

        isCheckingWorktree = true
        defer { isCheckingWorktree = false }
        do {
            worktreeStatus = try await api.checkWorktreeStatus(
                owner: item.repo.owner,
                repo: item.repo.name,
                issueNumber: item.issue.number
            )
        } catch {
            worktreeStatusError = error.localizedDescription
        }
    }

    private func resetWorktree() async {
        guard !isResettingWorktree else { return }
        isResettingWorktree = true
        resetMessage = nil
        resetErrorMessage = nil
        launchErrorMessage = nil
        defer { isResettingWorktree = false }

        do {
            let response = try await api.resetWorktree(
                owner: item.repo.owner,
                repo: item.repo.name,
                issueNumber: item.issue.number
            )
            guard response.success else {
                resetErrorMessage = response.error ?? "Could not reset worktree."
                return
            }
            options.resumeBehavior = .reset
            worktreeStatus = WorktreeStatusResponse(
                exists: true,
                dirty: false,
                path: worktreeStatus?.path ?? item.repo.localPath ?? ""
            )
            resetMessage = "Worktree reset. Launch will start from a clean checkout."
        } catch {
            resetErrorMessage = error.localizedDescription
        }
    }
}

private struct MacEditIssueSheet: View {
    @Environment(\.dismiss) private var dismiss

    let issue: GitHubIssue
    let owner: String
    let repo: String
    let onSave: (String?, String?) async throws -> Void

    @State private var title: String
    @State private var bodyText: String
    @State private var isSaving = false
    @State private var isUploadingImage = false
    @State private var errorMessage: String?

    init(issue: GitHubIssue, owner: String, repo: String, onSave: @escaping (String?, String?) async throws -> Void) {
        self.issue = issue
        self.owner = owner
        self.repo = repo
        self.onSave = onSave
        _title = State(initialValue: issue.title)
        _bodyText = State(initialValue: issue.body ?? "")
    }

    private var trimmedTitle: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedBody: String { bodyText.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var hasChanges: Bool {
        trimmedTitle != issue.title || trimmedBody != (issue.body ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Edit Issue")
                    .font(.headline)
                Spacer()
                Button("Cancel") { dismiss() }
                    .disabled(isSaving)
            }

            TextField("Title", text: $title)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("mac-edit-issue-title-field")

            TextEditor(text: $bodyText)
                .font(.body)
                .frame(minHeight: 220)
                .overlay {
                    RoundedRectangle(cornerRadius: 7)
                        .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
                }
                .accessibilityIdentifier("mac-edit-issue-body-field")

            MacImageAttachmentButton(
                owner: owner,
                repo: repo,
                accessibilityPrefix: "mac-edit-issue",
                isUploading: $isUploadingImage
            ) { markdown in
                appendMarkdown(markdown, to: &bodyText)
            }

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("mac-edit-issue-error")
            }

            HStack {
                Spacer()
                Button {
                    Task { await save() }
                } label: {
                    if isSaving {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label("Save", systemImage: "checkmark.circle")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(trimmedTitle.isEmpty || !hasChanges || isSaving || isUploadingImage)
                .accessibilityIdentifier("mac-edit-issue-save-button")
            }
        }
        .padding(16)
        .frame(minWidth: 460, minHeight: 420)
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        do {
            try await onSave(
                trimmedTitle != issue.title ? trimmedTitle : nil,
                trimmedBody != (issue.body ?? "") ? trimmedBody : nil
            )
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct MacCloseIssueSheet: View {
    @Environment(\.dismiss) private var dismiss

    let issueNumber: Int
    let owner: String
    let repo: String
    let onClose: (String?) async throws -> Void

    @State private var comment = ""
    @State private var isClosing = false
    @State private var isUploadingImage = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Close Issue #\(issueNumber)")
                    .font(.headline)
                Spacer()
                Button("Cancel") { dismiss() }
                    .disabled(isClosing)
            }

            TextEditor(text: $comment)
                .font(.body)
                .frame(minHeight: 160)
                .overlay {
                    RoundedRectangle(cornerRadius: 7)
                        .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
                }
                .accessibilityIdentifier("mac-close-issue-comment-field")

            MacImageAttachmentButton(
                owner: owner,
                repo: repo,
                accessibilityPrefix: "mac-close-issue",
                isUploading: $isUploadingImage
            ) { markdown in
                appendMarkdown(markdown, to: &comment)
            }

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("mac-close-issue-error")
            }

            HStack {
                Spacer()
                Button(role: .destructive) {
                    Task { await close() }
                } label: {
                    if isClosing {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label("Close Issue", systemImage: "xmark.circle")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isClosing || isUploadingImage)
                .accessibilityIdentifier("mac-close-issue-submit-button")
            }
        }
        .padding(16)
        .frame(minWidth: 440, minHeight: 320)
    }

    private func close() async {
        isClosing = true
        errorMessage = nil
        defer { isClosing = false }

        do {
            let trimmed = comment.trimmingCharacters(in: .whitespacesAndNewlines)
            try await onClose(trimmed.isEmpty ? nil : trimmed)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct MacEditCommentSheet: View {
    @Environment(\.dismiss) private var dismiss

    let comment: GitHubComment
    let owner: String
    let repo: String
    let onSave: (String) async throws -> Void

    @State private var bodyText: String
    @State private var isSaving = false
    @State private var isUploadingImage = false
    @State private var errorMessage: String?

    init(comment: GitHubComment, owner: String, repo: String, onSave: @escaping (String) async throws -> Void) {
        self.comment = comment
        self.owner = owner
        self.repo = repo
        self.onSave = onSave
        _bodyText = State(initialValue: comment.body)
    }

    private var trimmedBody: String { bodyText.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Edit Comment")
                    .font(.headline)
                Spacer()
                Button("Cancel") { dismiss() }
                    .disabled(isSaving)
            }

            TextEditor(text: $bodyText)
                .font(.body)
                .frame(minHeight: 180)
                .overlay {
                    RoundedRectangle(cornerRadius: 7)
                        .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
                }
                .accessibilityIdentifier("mac-edit-comment-body-field")

            MacImageAttachmentButton(
                owner: owner,
                repo: repo,
                accessibilityPrefix: "mac-edit-comment",
                isUploading: $isUploadingImage
            ) { markdown in
                appendMarkdown(markdown, to: &bodyText)
            }

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("mac-edit-comment-error")
            }

            HStack {
                Spacer()
                Button {
                    Task { await save() }
                } label: {
                    if isSaving {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label("Save", systemImage: "checkmark.circle")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(trimmedBody.isEmpty || trimmedBody == comment.body || isSaving || isUploadingImage)
                .accessibilityIdentifier("mac-edit-comment-save-button")
            }
        }
        .padding(16)
        .frame(minWidth: 440, minHeight: 340)
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        do {
            try await onSave(trimmedBody)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct MacLabelManagementSheet: View {
    @Environment(\.dismiss) private var dismiss

    let issue: GitHubIssue
    let loadLabels: () async throws -> [GitHubLabel]
    let onToggle: (String, String) async throws -> Void

    @State private var availableLabels: [GitHubLabel] = []
    @State private var selectedLabels: Set<String>
    @State private var isLoading = true
    @State private var togglingLabels: Set<String> = []
    @State private var errorMessage: String?
    @State private var searchText = ""

    init(
        issue: GitHubIssue,
        loadLabels: @escaping () async throws -> [GitHubLabel],
        onToggle: @escaping (String, String) async throws -> Void
    ) {
        self.issue = issue
        self.loadLabels = loadLabels
        self.onToggle = onToggle
        _selectedLabels = State(initialValue: Set(issue.labels.map(\.name)))
    }

    private var filteredLabels: [GitHubLabel] {
        guard !searchText.isEmpty else { return availableLabels }
        return availableLabels.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Manage Labels")
                    .font(.headline)
                Spacer()
                Button("Done") { dismiss() }
            }

            TextField("Filter labels", text: $searchText)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("mac-label-management-search-field")

            if isLoading {
                ProgressView("Loading labels...")
                    .frame(maxWidth: .infinity, minHeight: 180)
            } else if availableLabels.isEmpty {
                ContentUnavailableView("No Labels", systemImage: "tag", description: Text("This repository has no labels."))
                    .frame(minHeight: 180)
            } else {
                List(filteredLabels) { label in
                    labelRow(label)
                }
                .frame(minHeight: 240)
            }

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("mac-label-management-error")
            }
        }
        .padding(16)
        .frame(minWidth: 420, minHeight: 360)
        .task { await load() }
    }

    private func labelRow(_ label: GitHubLabel) -> some View {
        let isSelected = selectedLabels.contains(label.name)
        let isToggling = togglingLabels.contains(label.name)

        return Button {
            Task { await toggle(label, isSelected: isSelected) }
        } label: {
            HStack(spacing: 10) {
                Circle()
                    .fill(Color(macHex: label.color) ?? .secondary)
                    .frame(width: 12, height: 12)
                VStack(alignment: .leading, spacing: 2) {
                    Text(label.name)
                        .font(.body)
                    if let description = label.description, !description.isEmpty {
                        Text(description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                Spacer()
                if isToggling {
                    ProgressView()
                        .controlSize(.small)
                } else if isSelected {
                    Image(systemName: "checkmark")
                        .foregroundStyle(.blue)
                }
            }
        }
        .disabled(isToggling)
        .accessibilityIdentifier("mac-label-management-row-\(label.name)")
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            availableLabels = try await loadLabels()
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func toggle(_ label: GitHubLabel, isSelected: Bool) async {
        togglingLabels.insert(label.name)
        errorMessage = nil
        defer { togglingLabels.remove(label.name) }

        do {
            try await onToggle(label.name, isSelected ? "remove" : "add")
            if isSelected {
                selectedLabels.remove(label.name)
            } else {
                selectedLabels.insert(label.name)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct MacAssigneeManagementSheet: View {
    @Environment(\.dismiss) private var dismiss

    let issue: GitHubIssue
    let loadCollaborators: () async throws -> [CollaboratorInfo]
    let onUpdate: ([String]) async throws -> Void

    @State private var collaborators: [CollaboratorInfo] = []
    @State private var selectedAssignees: Set<String>
    @State private var isLoading = true
    @State private var togglingAssignees: Set<String> = []
    @State private var errorMessage: String?
    @State private var searchText = ""

    init(
        issue: GitHubIssue,
        loadCollaborators: @escaping () async throws -> [CollaboratorInfo],
        onUpdate: @escaping ([String]) async throws -> Void
    ) {
        self.issue = issue
        self.loadCollaborators = loadCollaborators
        self.onUpdate = onUpdate
        _selectedAssignees = State(initialValue: Set((issue.assignees ?? []).map(\.login)))
    }

    private var filteredCollaborators: [CollaboratorInfo] {
        guard !searchText.isEmpty else { return collaborators }
        return collaborators.filter { $0.login.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Manage Assignees")
                    .font(.headline)
                Spacer()
                Button("Done") { dismiss() }
            }

            TextField("Filter collaborators", text: $searchText)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("mac-assignee-management-search-field")

            if isLoading {
                ProgressView("Loading collaborators...")
                    .frame(maxWidth: .infinity, minHeight: 180)
            } else if collaborators.isEmpty {
                ContentUnavailableView("No Collaborators", systemImage: "person.2", description: Text("This repository has no collaborators."))
                    .frame(minHeight: 180)
            } else {
                List(filteredCollaborators) { collaborator in
                    collaboratorRow(collaborator)
                }
                .frame(minHeight: 240)
            }

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("mac-assignee-management-error")
            }
        }
        .padding(16)
        .frame(minWidth: 420, minHeight: 360)
        .task { await load() }
    }

    private func collaboratorRow(_ collaborator: CollaboratorInfo) -> some View {
        let isSelected = selectedAssignees.contains(collaborator.login)
        let isToggling = togglingAssignees.contains(collaborator.login)

        return Button {
            Task { await toggle(collaborator.login, isSelected: isSelected) }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "person.circle.fill")
                    .foregroundStyle(.secondary)
                Text(collaborator.login)
                    .font(.body)
                Spacer()
                if isToggling {
                    ProgressView()
                        .controlSize(.small)
                } else if isSelected {
                    Image(systemName: "checkmark")
                        .foregroundStyle(.blue)
                }
            }
        }
        .disabled(isToggling)
        .accessibilityIdentifier("mac-assignee-management-row-\(collaborator.login)")
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            collaborators = try await loadCollaborators()
                .sorted { $0.login.localizedCaseInsensitiveCompare($1.login) == .orderedAscending }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func toggle(_ login: String, isSelected: Bool) async {
        togglingAssignees.insert(login)
        errorMessage = nil
        let previousAssignees = selectedAssignees
        defer { togglingAssignees.remove(login) }

        if isSelected {
            selectedAssignees.remove(login)
        } else {
            selectedAssignees.insert(login)
        }

        do {
            try await onUpdate(Array(selectedAssignees).sorted())
        } catch {
            selectedAssignees = previousAssignees
            errorMessage = error.localizedDescription
        }
    }
}

private struct MacReassignIssueSheet: View {
    @Environment(\.dismiss) private var dismiss

    let issue: GitHubIssue
    let sourceRepo: Repo
    let repos: [Repo]
    let onReassign: (Repo) async throws -> Void

    @State private var selectedRepoId: Int?
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private var targetRepos: [Repo] {
        repos.filter { $0.id != sourceRepo.id }
    }

    private var selectedRepo: Repo? {
        targetRepos.first { $0.id == selectedRepoId }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Reassign Issue")
                    .font(.headline)
                Spacer()
                Button("Cancel") { dismiss() }
                    .disabled(isSubmitting)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("#\(issue.number) \(issue.title)")
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)
                Text("From \(sourceRepo.fullName)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if targetRepos.isEmpty {
                ContentUnavailableView("No Target Repositories", systemImage: "tray", description: Text("Track another repository before reassigning this issue."))
                    .frame(minHeight: 160)
            } else {
                List(targetRepos) { repo in
                    Button {
                        selectedRepoId = repo.id
                    } label: {
                        HStack {
                            Text(repo.fullName)
                            Spacer()
                            if selectedRepoId == repo.id {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.blue)
                            }
                        }
                    }
                    .accessibilityIdentifier("mac-reassign-target-\(repo.fullName)")
                }
                .frame(minHeight: 180)
            }

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("mac-reassign-error")
            }

            HStack {
                Spacer()
                Button(role: .destructive) {
                    Task { await submit() }
                } label: {
                    if isSubmitting {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label("Reassign", systemImage: "arrow.triangle.swap")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(selectedRepo == nil || isSubmitting)
                .accessibilityIdentifier("mac-reassign-submit-button")
            }
        }
        .padding(16)
        .frame(minWidth: 440, minHeight: 360)
    }

    private func submit() async {
        guard let selectedRepo else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            try await onReassign(selectedRepo)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private extension Color {
    init?(macHex: String) {
        let hex = macHex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard hex.count == 6,
              let value = UInt64(hex, radix: 16) else { return nil }

        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

private struct MacLightboxImage: Identifiable {
    let url: URL
    let altText: String

    var id: String { url.absoluteString }
}

private struct MacMarkdownView: View {
    let content: String
    let accessibilityPrefix: String
    let openImage: (MacLightboxImage) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(MacMarkdownParser.blocks(from: content).enumerated()), id: \.offset) { index, block in
                if block.isCode {
                    Text(block.text)
                        .font(.body.monospaced())
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.secondary.opacity(0.10), in: RoundedRectangle(cornerRadius: 6))
                        .textSelection(.enabled)
                } else if let image = block.image {
                    MacMarkdownImageButton(image: image) {
                        openImage(image)
                    }
                    .accessibilityIdentifier("\(accessibilityPrefix)-image-\(index)")
                } else if let attributed = block.attributedText {
                    Text(attributed)
                        .font(.body)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    Text(block.text)
                        .font(.body)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

private struct MacMarkdownImageButton: View {
    let image: MacLightboxImage
    let openImage: () -> Void

    var body: some View {
        Button(action: openImage) {
            VStack(alignment: .leading, spacing: 6) {
                if let fixtureImage = MacFixtureImageStore.image(for: image.url) {
                    Image(nsImage: fixtureImage)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxWidth: 260, maxHeight: 180)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .accessibilityIdentifier("mac-markdown-image-loaded")
                } else {
                    AsyncImage(url: image.url) { phase in
                        switch phase {
                        case .empty:
                            ProgressView()
                                .frame(width: 180, height: 110)
                                .accessibilityIdentifier("mac-markdown-image-loading")
                        case .success(let loadedImage):
                            loadedImage
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(maxWidth: 260, maxHeight: 180)
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                                .accessibilityIdentifier("mac-markdown-image-loaded")
                        case .failure:
                            Label("Image unavailable", systemImage: "photo.badge.exclamationmark")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .accessibilityIdentifier("mac-markdown-image-error")
                        @unknown default:
                            EmptyView()
                        }
                    }
                }

                if !image.altText.isEmpty {
                    Text(image.altText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 7))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(image.altText.isEmpty ? "Image attachment" : image.altText)
    }
}

private struct MacImageLightbox: View {
    let url: URL
    let altText: String
    let onClose: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()

            Group {
                if let fixtureImage = MacFixtureImageStore.image(for: url) {
                    Image(nsImage: fixtureImage)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .padding(24)
                        .accessibilityIdentifier("mac-image-lightbox-loaded-image")
                } else {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .empty:
                            ProgressView()
                                .tint(.white)
                                .accessibilityIdentifier("mac-image-lightbox-loading")
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .padding(24)
                                .accessibilityIdentifier("mac-image-lightbox-loaded-image")
                        case .failure:
                            ContentUnavailableView {
                                Label("Failed to Load", systemImage: "photo.badge.exclamationmark")
                                    .foregroundStyle(.white)
                            } description: {
                                Text("Could not load image")
                                    .foregroundStyle(.white.opacity(0.75))
                            }
                            .accessibilityIdentifier("mac-image-lightbox-error")
                        @unknown default:
                            EmptyView()
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 28, weight: .semibold))
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, .white.opacity(0.35))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(28)
            .accessibilityLabel("Close image")
            .accessibilityIdentifier("mac-image-lightbox-close-button")
        }
        .frame(minWidth: 520, minHeight: 420)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(altText.isEmpty ? "Image preview" : altText)
    }
}

private enum MacFixtureImageStore {
    static func image(for url: URL) -> NSImage? {
        guard url.host == "issuectl-ui-test.local",
              ["/fixtures/alpha.png", "/fixtures/uploaded.png"].contains(url.path),
              let data = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAqADAAQAAAABAAAAAgAAAADtGLyqAAAAEklEQVQIHWP8DwQMQMAEIkAAAD34BACALvQ5AAAAAElFTkSuQmCC") else {
            return nil
        }
        return NSImage(data: data)
    }
}

private enum MacMarkdownParser {
    static func blocks(from source: String) -> [MacMarkdownBlock] {
        splitCodeBlocks(source).flatMap { block -> [MacMarkdownBlock] in
            guard !block.isCode else { return [block] }

            return splitImageBlocks(block.text).map { imageBlock in
                guard imageBlock.image == nil else { return imageBlock }
                return MacMarkdownBlock(
                    text: imageBlock.text,
                    isCode: false,
                    attributedText: try? AttributedString(
                        markdown: imageBlock.text,
                        options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
                    )
                )
            }
        }
    }

    private static func splitCodeBlocks(_ source: String) -> [MacMarkdownBlock] {
        var blocks: [MacMarkdownBlock] = []
        var current = ""
        var insideCode = false

        for line in source.components(separatedBy: "\n") {
            if line.hasPrefix("```") {
                if insideCode {
                    blocks.append(MacMarkdownBlock(text: current, isCode: true))
                    current = ""
                    insideCode = false
                } else {
                    let prose = current.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !prose.isEmpty {
                        blocks.append(MacMarkdownBlock(text: prose, isCode: false))
                    }
                    current = ""
                    insideCode = true
                }
            } else {
                current += current.isEmpty ? line : "\n" + line
            }
        }

        let remaining = current.trimmingCharacters(in: .whitespacesAndNewlines)
        if !remaining.isEmpty {
            blocks.append(MacMarkdownBlock(text: remaining, isCode: insideCode))
        }
        return blocks
    }

    private static func splitImageBlocks(_ source: String) -> [MacMarkdownBlock] {
        let pattern = #"!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return [MacMarkdownBlock(text: source, isCode: false)]
        }

        let nsSource = source as NSString
        let fullRange = NSRange(location: 0, length: nsSource.length)
        let matches = regex.matches(in: source, range: fullRange)
        guard !matches.isEmpty else {
            return [MacMarkdownBlock(text: source, isCode: false)]
        }

        var blocks: [MacMarkdownBlock] = []
        var cursor = 0

        for match in matches {
            if match.range.location > cursor {
                let text = nsSource.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty {
                    blocks.append(MacMarkdownBlock(text: text, isCode: false))
                }
            }

            let altText = match.range(at: 1).location == NSNotFound ? "" : nsSource.substring(with: match.range(at: 1))
            let rawURL = match.range(at: 2).location == NSNotFound ? "" : nsSource.substring(with: match.range(at: 2))
            if let url = URL(string: rawURL) {
                blocks.append(MacMarkdownBlock(image: MacLightboxImage(url: url, altText: altText)))
            } else {
                blocks.append(MacMarkdownBlock(text: nsSource.substring(with: match.range), isCode: false))
            }

            cursor = match.range.location + match.range.length
        }

        if cursor < nsSource.length {
            let text = nsSource.substring(with: NSRange(location: cursor, length: nsSource.length - cursor))
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty {
                blocks.append(MacMarkdownBlock(text: text, isCode: false))
            }
        }

        return blocks
    }
}

private struct MacMarkdownBlock {
    let text: String
    let isCode: Bool
    let attributedText: AttributedString?
    let image: MacLightboxImage?

    init(text: String, isCode: Bool, attributedText: AttributedString? = nil) {
        self.text = text
        self.isCode = isCode
        self.attributedText = attributedText
        self.image = nil
    }

    init(image: MacLightboxImage) {
        self.text = ""
        self.isCode = false
        self.attributedText = nil
        self.image = image
    }
}

private struct MacStateBadge: View {
    let isOpen: Bool

    var body: some View {
        Label(isOpen ? "Open" : "Closed", systemImage: isOpen ? "circle.circle" : "checkmark.circle.fill")
            .font(.caption.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(isOpen ? Color.green.opacity(0.15) : Color.purple.opacity(0.15), in: Capsule())
            .foregroundStyle(isOpen ? .green : .purple)
    }
}

private struct MacPriorityBadge: View {
    let priority: Priority

    var body: some View {
        Label(priority.rawValue.capitalized, systemImage: "flag")
            .font(.caption.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tint.opacity(0.14), in: Capsule())
            .foregroundStyle(tint)
    }

    private var tint: Color {
        switch priority {
        case .high:
            .red
        case .normal:
            .blue
        case .low:
            .secondary
        }
    }
}
