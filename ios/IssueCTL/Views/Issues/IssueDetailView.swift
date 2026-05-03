import SwiftUI

struct IssueDetailView: View {
    @Environment(APIClient.self) private var api
    @Environment(\.openURL) private var openURL
    let owner: String
    let repo: String
    let number: Int

    @State private var detail: IssueDetailResponse?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var activeDetailSheet: DetailSheet?
    @State private var terminalTarget: ActiveDeployment?
    @State private var liveDeployment: ActiveDeployment?
    @State private var isClosing = false
    @State private var isReopening = false
    @State private var activeConfirmation: ActiveConfirmation?
    @State private var actionError: String?

    // Comment actions and error display
    @State private var isDeletingComment = false
    @State private var currentUserLogin: String?
    @State private var showActionError = false

    // Priority state
    @State private var currentPriority: Priority = .normal
    @State private var isLoadingPriority = false
    @State private var staleHint: String?
    @State private var staleHintDismissTask: Task<Void, Never>?

    var body: some View {
        Group {
            if isLoading && detail == nil {
                ProgressView("Loading issue...")
            } else if let errorMessage {
                ContentUnavailableView {
                    Label("Error", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button("Retry") { Task { await load() } }
                }
            } else if let detail {
                VStack(spacing: 0) {
                    if let staleHint {
                        Label(staleHint, systemImage: "arrow.clockwise")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal)
                            .padding(.vertical, 6)
                            .frame(maxWidth: .infinity)
                            .background(.ultraThinMaterial)
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            headerSection(detail.issue)
                            primaryActionSection(detail)
                            bodySection(detail.issue)
                            if !detail.linkedPRs.isEmpty {
                                linkedPRsSection(detail.linkedPRs)
                            }
                            if !detail.deployments.isEmpty {
                                deploymentsSection(detail.deployments)
                            }
                            if !detail.comments.isEmpty {
                                commentsSection(detail.comments)
                            }
                        }
                        .padding()
                    }
                    .refreshable { await load(refresh: true) }
                }
            }
        }
        .navigationTitle("#\(number)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if detail != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    issueActionsMenu
                }
            }
        }
        .navigationDestination(for: PRDestination.self) { dest in
            PRDetailView(owner: dest.owner, repo: dest.repo, number: dest.number)
        }
        .sheet(item: $activeDetailSheet, onDismiss: {
            Task { await load(refresh: true) }
        }) { sheet in
            switch sheet {
            case .reassign(let detail):
                ReassignSheet(
                    owner: owner, repo: repo, number: number,
                    issueTitle: detail.issue.title
                ) { _, _, _ in
                    Task { await load(refresh: true) }
                }
            case .launch(let detail):
                LaunchView(
                    owner: owner,
                    repo: repo,
                    issueNumber: number,
                    issueTitle: detail.issue.title,
                    comments: detail.comments,
                    referencedFiles: detail.referencedFiles
                ) { deployment in
                    liveDeployment = deployment
                }
                .presentationDetents([.fraction(0.66), .large])
                .presentationDragIndicator(.visible)
            case .edit(let detail):
                EditIssueSheet(
                    owner: owner, repo: repo, number: number,
                    currentTitle: detail.issue.title,
                    currentBody: detail.issue.body,
                    onSuccess: { Task { await load(refresh: true) } }
                )
            case .labels(let detail):
                LabelManagementSheet(
                    owner: owner, repo: repo, number: number,
                    currentLabels: detail.issue.labels,
                    onSuccess: { Task { await load(refresh: true) } }
                )
            case .assignees(let detail):
                AssigneeSheet(
                    owner: owner, repo: repo, number: number,
                    currentAssignees: (detail.issue.assignees ?? []).map(\.login),
                    onUpdate: { _ in Task { await load(refresh: true) } }
                )
            case .comment:
                IssueCommentSheet(
                    owner: owner, repo: repo, number: number,
                    onSuccess: { Task { await load(refresh: true) } }
                )
            case .closeWithComment:
                CloseIssueSheet(
                    owner: owner, repo: repo, number: number,
                    onSuccess: { Task { await load(refresh: true) } }
                )
            case .editComment(let comment):
                EditCommentSheet(
                    owner: owner, repo: repo, number: number,
                    commentId: comment.id, currentBody: comment.body,
                    onSuccess: { Task { await load(refresh: true) } }
                )
            }
        }
        .fullScreenCover(item: $terminalTarget, onDismiss: {
            terminalTarget = nil
        }) { deployment in
            if let port = deployment.ttydPort {
                TerminalView(
                    deployment: deployment,
                    port: port,
                    onClose: {
                        terminalTarget = nil
                    },
                    onEnd: {
                        terminalTarget = nil
                        Task { await load(refresh: true) }
                    }
                )
            }
        }
        .confirmationDialog(
            confirmationTitle,
            isPresented: .init(
                get: { activeConfirmation != nil },
                set: { if !$0 { activeConfirmation = nil } }
            ),
            titleVisibility: .visible
        ) {
            confirmationActions
        } message: {
            confirmationMessage
        }
        .alert("Error", isPresented: $showActionError) {
            Button("OK") { actionError = nil }
        } message: {
            Text(actionError ?? "")
        }
        .onChange(of: actionError) { _, newValue in
            showActionError = newValue != nil
        }
        .task { await load() }
        .onAppear {
            actionError = nil
        }
        .animation(.easeInOut(duration: 0.25), value: staleHint != nil)
        .onDisappear { staleHintDismissTask?.cancel() }
    }

    // MARK: - Sections

    @ViewBuilder
    private func headerSection(_ issue: GitHubIssue) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(issue.title)
                .font(.title2.weight(.semibold))

            HStack(spacing: 8) {
                StateBadge(isOpen: issue.isOpen)

                PriorityBadge(priority: currentPriority)

                if let user = issue.user {
                    Text(user.login)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Text(issue.timeAgo)
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
            }

            if !issue.labels.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(issue.labels) { label in
                        LabelBadge(label: label)
                    }
                }
            }

            if let assignees = issue.assignees, !assignees.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "person.2")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    FlowLayout(spacing: 4) {
                        ForEach(assignees, id: \.login) { assignee in
                            Text(assignee.login)
                                .font(.caption)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.secondary.opacity(0.12))
                                .clipShape(Capsule())
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func bodySection(_ issue: GitHubIssue) -> some View {
        if let body = issue.body, !body.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Divider()
                MarkdownView(content: body)
            }
        }
    }

    @ViewBuilder
    private func primaryActionSection(_ detail: IssueDetailResponse) -> some View {
        let issue = detail.issue
        VStack(alignment: .leading, spacing: 12) {
            IssueDetailSectionHeader(
                title: issue.isOpen ? "Next Action" : "Issue Closed",
                systemImage: issue.isOpen ? "bolt.fill" : "checkmark.circle.fill"
            )

            if issue.isOpen {
                if let deployment = activeDeployment(from: detail) {
                    SessionStatusCard(
                        title: deployment.ttydPort == nil ? "Session Starting" : "Session Active",
                        subtitle: "\(deployment.branchName) - \(deployment.runningDuration)",
                        status: deployment.ttydPort == nil ? "Terminal not ready" : "Terminal ready",
                        systemImage: deployment.ttydPort == nil ? "hourglass" : "terminal",
                        tint: deployment.ttydPort == nil ? .orange : .green,
                        primaryTitle: deployment.ttydPort == nil ? nil : "Open Terminal",
                        primarySystemImage: "terminal",
                        primaryAccessibilityIdentifier: "issue-detail-reenter-terminal-button",
                        primaryAction: {
                            openTerminal(deployment)
                        }
                    )
                    .accessibilityIdentifier("issue-detail-session-status-card")
                } else {
                    SessionStatusCard(
                        title: "Ready to Launch",
                        subtitle: "Start an agent session for this issue.",
                        status: "No active session",
                        systemImage: "play.circle.fill",
                        tint: IssueCTLColors.action,
                        primaryTitle: "Launch Agent",
                        primarySystemImage: "play.fill",
                        primaryAccessibilityIdentifier: "issue-detail-launch-button",
                        primaryAction: {
                            activeDetailSheet = .launch(detail)
                        }
                    )
                    .accessibilityIdentifier("issue-detail-launch-status-card")
                }
            } else {
                SessionStatusCard(
                    title: "Closed",
                    subtitle: "Reopen this issue to continue work.",
                    status: "Closed issue",
                    systemImage: "checkmark.circle.fill",
                    tint: .purple,
                    primaryTitle: "Reopen",
                    primarySystemImage: "arrow.uturn.backward.circle",
                    primaryAccessibilityIdentifier: "issue-detail-reopen-button",
                    primaryAction: {
                        activeConfirmation = .reopenIssue
                    }
                )
                .accessibilityIdentifier("issue-detail-closed-status-card")
            }
        }
    }

    @ViewBuilder
    private func linkedPRsSection(_ prs: [GitHubPull]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            IssueDetailSectionHeader(title: "Linked Pull Requests", systemImage: "arrow.triangle.merge")

            ForEach(prs) { pr in
                NavigationLink(value: PRDestination(owner: owner, repo: repo, number: pr.number)) {
                    HStack(spacing: 6) {
                        Image(systemName: pr.isOpen ? "arrow.triangle.merge" : (pr.merged ? "checkmark.circle.fill" : "xmark.circle"))
                            .foregroundStyle(pr.isOpen ? .green : (pr.merged ? .purple : .red))
                        Text("#\(pr.number)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text(pr.title)
                            .font(.subheadline)
                            .lineLimit(1)
                        Spacer()
                        Text(pr.diffSummary)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    @ViewBuilder
    private func deploymentsSection(_ deployments: [Deployment]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            IssueDetailSectionHeader(title: "Sessions", systemImage: "play.circle")

            ForEach(deployments) { deployment in
                if deployment.isActive, deployment.ttydPort != nil {
                    Button {
                        openTerminal(activeDeployment(from: deployment))
                    } label: {
                        deploymentRow(deployment, showsTerminal: true)
                    }
                    .buttonStyle(.plain)
                } else {
                    deploymentRow(deployment, showsTerminal: false)
                }
            }
        }
    }

    private func deploymentRow(_ deployment: Deployment, showsTerminal: Bool) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(deployment.isActive ? .green : .secondary)
                .frame(width: 8, height: 8)
            Text(deployment.branchName)
                .font(.subheadline)
            Spacer()
            if showsTerminal {
                Label("Open", systemImage: "terminal")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.blue)
            } else {
                Text(deployment.isActive ? deployment.state.rawValue : "ended")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private func commentsSection(_ comments: [GitHubComment]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            IssueDetailSectionHeader(
                title: "\(comments.count) Comment\(comments.count == 1 ? "" : "s")",
                systemImage: "bubble.left"
            )

            ForEach(comments) { comment in
                let isOwnComment = currentUserLogin != nil && comment.user?.login == currentUserLogin
                if isOwnComment {
                    CommentView(comment: comment)
                        .contextMenu {
                            Button {
                                activeDetailSheet = .editComment(comment)
                            } label: {
                                Label("Edit", systemImage: "pencil")
                            }

                            Button(role: .destructive) {
                                activeConfirmation = .deleteComment(comment)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                } else {
                    CommentView(comment: comment)
                }

                if comment.id != comments.last?.id {
                    Divider()
                }
            }
        }
    }

    private var issueActionsMenu: some View {
        Menu {
            if let detail {
                Button {
                    activeDetailSheet = .comment
                } label: {
                    Label("Comment", systemImage: "bubble.left")
                }

                Button {
                    activeDetailSheet = .edit(detail)
                } label: {
                    Label("Edit Issue", systemImage: "pencil")
                }

                Button {
                    activeDetailSheet = .labels(detail)
                } label: {
                    Label("Manage Labels", systemImage: "tag")
                }

                Button {
                    activeDetailSheet = .assignees(detail)
                } label: {
                    Label("Manage Assignees", systemImage: "person.badge.plus")
                }

                Divider()

                Menu {
                    ForEach(Priority.allCases, id: \.self) { priority in
                        Button {
                            let previousPriority = currentPriority
                            currentPriority = priority
                            Task { await confirmPriority(priority, rollbackTo: previousPriority) }
                        } label: {
                            HStack {
                                Text(priority.rawValue.capitalized)
                                if priority == currentPriority {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    Label("Priority", systemImage: "arrow.up.arrow.down")
                }

                Button {
                    activeDetailSheet = .reassign(detail)
                } label: {
                    Label("Reassign to Repo", systemImage: "arrow.triangle.swap")
                }

                Divider()

                Button {
                    if let url = URL(string: detail.issue.htmlUrl) {
                        openURL(url)
                    }
                } label: {
                    Label("Open on GitHub", systemImage: "safari")
                }

                if detail.issue.isOpen {
                    Button(role: .destructive) {
                        activeConfirmation = .closeIssue
                    } label: {
                        if isClosing {
                            Label("Closing", systemImage: "hourglass")
                        } else {
                            Label("Close Issue", systemImage: "xmark.circle")
                        }
                    }
                    .disabled(isClosing)
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 16, weight: .semibold))
                .frame(width: 44, height: 36)
        }
        .buttonStyle(.bordered)
        .accessibilityLabel("Issue actions")
        .accessibilityIdentifier("issue-detail-actions-menu")
    }

    // MARK: - Confirmation Dialog Helpers

    private var confirmationTitle: String {
        switch activeConfirmation {
        case .closeIssue: "Close Issue"
        case .reopenIssue: "Reopen Issue"
        case .deleteComment: "Delete Comment"
        case nil: ""
        }
    }

    @ViewBuilder
    private var confirmationActions: some View {
        switch activeConfirmation {
        case .closeIssue:
            Button("Close", role: .destructive) { Task { await closeWithoutComment() } }
            Button("Close with comment...") { activeDetailSheet = .closeWithComment }
        case .reopenIssue:
            Button("Reopen") { Task { await reopen() } }
        case .deleteComment(let comment):
            Button("Delete", role: .destructive) {
                Task { await deleteComment(comment) }
            }
        case nil:
            EmptyView()
        }
    }

    @ViewBuilder
    private var confirmationMessage: some View {
        switch activeConfirmation {
        case .deleteComment:
            Text("Are you sure you want to delete this comment? This cannot be undone.")
        default:
            EmptyView()
        }
    }

    // MARK: - Loading

    private func load(refresh: Bool = false) async {
        isLoading = true
        errorMessage = nil
        actionError = nil
        do {
            async let detailResult = api.issueDetail(owner: owner, repo: repo, number: number, refresh: refresh)
            async let deploymentsResult: Result<ActiveDeploymentsResponse, Error> = {
                do { return .success(try await api.activeDeployments()) }
                catch { return .failure(error) }
            }()
            async let userResult: Result<UserResponse, Error> = {
                do { return .success(try await api.currentUser()) }
                catch { return .failure(error) }
            }()
            async let priorityResult: Result<Priority, Error> = {
                do { return .success(try await api.getPriority(owner: owner, repo: repo, number: number)) }
                catch { return .failure(error) }
            }()
            detail = try await detailResult

            // Supplementary fetches — failures are non-fatal but surfaced
            var failures: [String] = []
            switch await deploymentsResult {
            case .success(let response):
                liveDeployment = response.deployments.first(where: isMatchingActiveDeployment)
            case .failure:
                break
            }
            switch await userResult {
            case .success(let user): currentUserLogin = user.login
            case .failure: currentUserLogin = nil
            }
            switch await priorityResult {
            case .success(let priority): currentPriority = priority
            case .failure(let error):
                currentPriority = .normal
                failures.append("priority (\(error.localizedDescription))")
            }
            if !failures.isEmpty {
                actionError = "Failed to load: \(failures.joined(separator: ", "))"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func activeDeployment(from detail: IssueDetailResponse) -> ActiveDeployment? {
        if let liveDeployment, isMatchingActiveDeployment(liveDeployment) {
            return liveDeployment
        }
        return detail.deployments.first(where: { $0.isActive }).map(activeDeployment(from:))
    }

    private func isMatchingActiveDeployment(_ deployment: ActiveDeployment) -> Bool {
        deployment.isActive &&
        deployment.owner == owner &&
        deployment.repoName == repo &&
        deployment.issueNumber == number
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
            owner: owner,
            repoName: repo
        )
    }

    private func openTerminal(_ deployment: ActiveDeployment) {
        guard deployment.ttydPort != nil else {
            actionError = "Session is running, but its terminal is not ready yet."
            return
        }
        terminalTarget = deployment
    }

    private func confirmPriority(_ priority: Priority, rollbackTo previous: Priority) async {
        guard !isLoadingPriority else { return }
        isLoadingPriority = true
        actionError = nil
        do {
            let response = try await api.setPriority(owner: owner, repo: repo, number: number, priority: priority)
            if !response.success {
                currentPriority = previous
                actionError = response.error ?? "Failed to set priority"
            }
        } catch {
            currentPriority = previous
            actionError = error.localizedDescription
        }
        isLoadingPriority = false
    }

    private func closeWithoutComment() async {
        isClosing = true
        defer { isClosing = false }
        actionError = nil
        do {
            let body = IssueStateRequestBody(state: "closed", comment: nil)
            let response = try await api.updateIssueState(owner: owner, repo: repo, number: number, body: body)
            if response.success {
                await load(refresh: true)
                showStaleHint("Issue closed — pull to refresh if stale")
            } else {
                actionError = response.error ?? "Failed to close issue"
            }
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func reopen() async {
        isReopening = true
        defer { isReopening = false }
        actionError = nil
        do {
            let body = IssueStateRequestBody(state: "open", comment: nil)
            let response = try await api.updateIssueState(owner: owner, repo: repo, number: number, body: body)
            if response.success {
                await load(refresh: true)
                showStaleHint("Issue reopened — pull to refresh if stale")
            } else {
                actionError = response.error ?? "Failed to reopen issue"
            }
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func deleteComment(_ comment: GitHubComment) async {
        isDeletingComment = true
        defer { isDeletingComment = false }
        actionError = nil
        do {
            let requestBody = DeleteCommentRequestBody(commentId: comment.id)
            let response = try await api.deleteComment(
                owner: owner, repo: repo, number: number,
                body: requestBody
            )
            if response.success {
                await load(refresh: true)
                showStaleHint("Comment deleted — pull to refresh if stale")
            } else {
                actionError = response.error ?? "Failed to delete comment"
            }
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func showStaleHint(_ message: String) {
        staleHintDismissTask?.cancel()
        staleHint = message
        staleHintDismissTask = Task {
            try? await Task.sleep(for: .seconds(3))
            if !Task.isCancelled { staleHint = nil }
        }
    }
}

// MARK: - Supporting Views

private struct IssueDetailSectionHeader: View {
    let title: String
    let systemImage: String

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.headline)
            .foregroundStyle(.primary)
            .accessibilityAddTraits(.isHeader)
    }
}

private struct SessionStatusCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let title: String
    let subtitle: String
    let status: String
    let systemImage: String
    let tint: Color
    let primaryTitle: String?
    let primarySystemImage: String
    let primaryAccessibilityIdentifier: String?
    let primaryAction: () -> Void

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 12) {
                    statusContent
                    primaryButton
                }
            } else {
                HStack(alignment: .center, spacing: 10) {
                    statusContent
                    Spacer(minLength: 0)
                    primaryButton
                }
            }
        }
        .padding(12)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius))
        .overlay {
            RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
        .accessibilityElement(children: .contain)
    }

    private var statusContent: some View {
        HStack(alignment: .center, spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 30, height: 30)
                .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: IssueCTLColors.iconCornerRadius))

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)

                    Text(status)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(tint)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(tint.opacity(0.12), in: Capsule())
                        .lineLimit(1)
                }

                Text(subtitle)
                    .font(dynamicTypeSize.isAccessibilitySize ? .subheadline : .caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 4 : 2)
            }
        }
    }

    @ViewBuilder
    private var primaryButton: some View {
        if let primaryTitle {
            Button {
                primaryAction()
            } label: {
                if dynamicTypeSize.isAccessibilitySize {
                    Label(primaryTitle, systemImage: primarySystemImage)
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 44)
                } else {
                    Image(systemName: primarySystemImage)
                        .font(.system(size: 15, weight: .semibold))
                        .frame(width: 36, height: 36)
                }
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(dynamicTypeSize.isAccessibilitySize ? .roundedRectangle : .circle)
            .tint(tint)
            .accessibilityLabel(primaryTitle)
            .accessibilityIdentifier(primaryAccessibilityIdentifier ?? "")
        }
    }
}

struct StateBadge: View {
    let isOpen: Bool

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: isOpen ? "circle.circle" : "checkmark.circle.fill")
            Text(isOpen ? "Open" : "Closed")
        }
        .font(.caption.weight(.medium))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(isOpen ? Color.green.opacity(0.15) : Color.purple.opacity(0.15))
        .foregroundStyle(isOpen ? .green : .purple)
        .clipShape(Capsule())
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            totalHeight = y + rowHeight
        }

        return (CGSize(width: maxWidth, height: totalHeight), positions)
    }
}

struct PriorityBadge: View {
    let priority: Priority

    var body: some View {
        // Only show badge for non-default priorities
        if priority != .normal {
            HStack(spacing: 4) {
                Image(systemName: iconName)
                Text(priority.rawValue.capitalized)
            }
            .font(.caption.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(badgeColor.opacity(0.15))
            .foregroundStyle(badgeColor)
            .clipShape(Capsule())
        }
    }

    private var badgeColor: Color {
        switch priority {
        case .high: .red
        case .normal: .secondary
        case .low: .blue
        }
    }

    private var iconName: String {
        switch priority {
        case .high: "arrow.up"
        case .normal: "minus"
        case .low: "arrow.down"
        }
    }
}

enum DetailSheet: Identifiable, Sendable {
    case reassign(IssueDetailResponse)
    case launch(IssueDetailResponse)
    case edit(IssueDetailResponse)
    case labels(IssueDetailResponse)
    case assignees(IssueDetailResponse)
    case comment
    case closeWithComment
    case editComment(GitHubComment)

    var id: String {
        switch self {
        case .reassign: "reassign"
        case .launch: "launch"
        case .edit: "edit"
        case .labels: "labels"
        case .assignees: "assignees"
        case .comment: "comment"
        case .closeWithComment: "closeWithComment"
        case .editComment(let c): "editComment-\(c.id)"
        }
    }
}

enum ActiveConfirmation: Identifiable, Sendable {
    case closeIssue
    case reopenIssue
    case deleteComment(GitHubComment)

    var id: String {
        switch self {
        case .closeIssue: "closeIssue"
        case .reopenIssue: "reopenIssue"
        case .deleteComment(let c): "deleteComment-\(c.id)"
        }
    }
}
