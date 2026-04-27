import SwiftUI

struct IssueDetailView: View {
    @Environment(APIClient.self) private var api
    let owner: String
    let repo: String
    let number: Int

    @State private var detail: IssueDetailResponse?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showLaunchSheet = false
    @State private var isClosing = false
    @State private var isReopening = false
    @State private var showCommentSheet = false
    @State private var showCloseSheet = false
    @State private var showCloseConfirm = false
    @State private var showReopenConfirm = false
    @State private var actionError: String?

    // State for issue editing, label management, and comment edit/delete actions
    @State private var showEditSheet = false
    @State private var showLabelSheet = false
    @State private var showAssigneeSheet = false
    @State private var editingComment: GitHubComment?
    @State private var deletingComment: GitHubComment?
    @State private var isDeletingComment = false
    @State private var currentUserLogin: String?
    @State private var showActionError = false

    // Priority state
    @State private var currentPriority: Priority = .normal
    @State private var isLoadingPriority = false
    @State private var showReassignSheet = false
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

                    actionBar(for: detail.issue)
                }
            }
        }
        .navigationTitle("#\(number)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if detail != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            showEditSheet = true
                        } label: {
                            Label("Edit Issue", systemImage: "pencil")
                        }
                        Button {
                            showLabelSheet = true
                        } label: {
                            Label("Manage Labels", systemImage: "tag")
                        }
                        Button {
                            showAssigneeSheet = true
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
                        Divider()
                        Button {
                            showReassignSheet = true
                        } label: {
                            Label("Reassign to Repo…", systemImage: "arrow.triangle.swap")
                        }
                        Button {
                            showLaunchSheet = true
                        } label: {
                            Label("Launch", systemImage: "play.fill")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
        .sheet(isPresented: $showReassignSheet) {
            if let detail {
                ReassignSheet(
                    owner: owner, repo: repo, number: number,
                    issueTitle: detail.issue.title
                ) { newOwner, newRepo, newNumber in
                    Task { await load(refresh: true) }
                }
            }
        }
        .sheet(isPresented: $showLaunchSheet) {
            if let detail {
                LaunchView(
                    owner: owner,
                    repo: repo,
                    issueNumber: number,
                    issueTitle: detail.issue.title,
                    comments: detail.comments,
                    referencedFiles: detail.referencedFiles
                )
            }
        }
        .sheet(isPresented: $showCommentSheet) {
            IssueCommentSheet(
                owner: owner, repo: repo, number: number,
                onSuccess: { Task { await load(refresh: true) } }
            )
        }
        .sheet(isPresented: $showCloseSheet) {
            CloseIssueSheet(
                owner: owner, repo: repo, number: number,
                onSuccess: { Task { await load(refresh: true) } }
            )
        }
        .sheet(isPresented: $showEditSheet) {
            if let detail {
                EditIssueSheet(
                    owner: owner, repo: repo, number: number,
                    currentTitle: detail.issue.title,
                    currentBody: detail.issue.body,
                    onSuccess: { Task { await load(refresh: true) } }
                )
            }
        }
        .sheet(isPresented: $showLabelSheet) {
            if let detail {
                LabelManagementSheet(
                    owner: owner, repo: repo, number: number,
                    currentLabels: detail.issue.labels,
                    onSuccess: { Task { await load(refresh: true) } }
                )
            }
        }
        .sheet(isPresented: $showAssigneeSheet) {
            if let detail {
                AssigneeSheet(
                    owner: owner, repo: repo, number: number,
                    currentAssignees: (detail.issue.assignees ?? []).map(\.login),
                    onUpdate: { _ in Task { await load(refresh: true) } }
                )
            }
        }
        .sheet(item: $editingComment) { comment in
            EditCommentSheet(
                owner: owner, repo: repo, number: number,
                commentId: comment.id, currentBody: comment.body,
                onSuccess: { Task { await load(refresh: true) } }
            )
        }
        .confirmationDialog("Close Issue", isPresented: $showCloseConfirm, titleVisibility: .visible) {
            Button("Close", role: .destructive) { Task { await closeWithoutComment() } }
            Button("Close with comment...") { showCloseSheet = true }
        }
        .confirmationDialog("Reopen Issue", isPresented: $showReopenConfirm, titleVisibility: .visible) {
            Button("Reopen") { Task { await reopen() } }
        }
        .confirmationDialog(
            "Delete Comment",
            isPresented: .init(
                get: { deletingComment != nil },
                set: { if !$0 { deletingComment = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                if let comment = deletingComment {
                    Task { await deleteComment(comment) }
                }
            }
        } message: {
            Text("Are you sure you want to delete this comment? This cannot be undone.")
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
                Text(body)
                    .font(.body)
                    .textSelection(.enabled)
            }
        }
    }

    @ViewBuilder
    private func linkedPRsSection(_ prs: [GitHubPull]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            Label("Linked Pull Requests", systemImage: "arrow.triangle.merge")
                .font(.headline)

            ForEach(prs) { pr in
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
                .padding(.vertical, 2)
            }
        }
    }

    @ViewBuilder
    private func deploymentsSection(_ deployments: [Deployment]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            Label("Deployments", systemImage: "play.circle")
                .font(.headline)

            ForEach(deployments) { deployment in
                HStack(spacing: 6) {
                    Circle()
                        .fill(deployment.isActive ? .green : .secondary)
                        .frame(width: 8, height: 8)
                    Text(deployment.branchName)
                        .font(.subheadline)
                    Spacer()
                    Text(deployment.state.rawValue)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 2)
            }
        }
    }

    @ViewBuilder
    private func commentsSection(_ comments: [GitHubComment]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            Label("\(comments.count) Comment\(comments.count == 1 ? "" : "s")", systemImage: "bubble.left")
                .font(.headline)

            ForEach(comments) { comment in
                let isOwnComment = currentUserLogin != nil && comment.user?.login == currentUserLogin
                if isOwnComment {
                    CommentView(comment: comment)
                        .contextMenu {
                            Button {
                                editingComment = comment
                            } label: {
                                Label("Edit", systemImage: "pencil")
                            }

                            Button(role: .destructive) {
                                deletingComment = comment
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

    // MARK: - Action Bar

    @ViewBuilder
    private func actionBar(for issue: GitHubIssue) -> some View {
        if issue.isOpen {
            HStack(spacing: 16) {
                Button {
                    showCommentSheet = true
                } label: {
                    Label("Comment", systemImage: "bubble.left")
                }

                Button {
                    showCloseConfirm = true
                } label: {
                    if isClosing {
                        ProgressView().controlSize(.small)
                    } else {
                        Label("Close", systemImage: "xmark.circle")
                    }
                }
                .tint(.red)
                .disabled(isClosing)
            }
            .labelStyle(.titleAndIcon)
            .font(.caption)
            .padding()
            .background(.bar)
        } else {
            HStack {
                Button {
                    showReopenConfirm = true
                } label: {
                    if isReopening {
                        ProgressView().controlSize(.small)
                    } else {
                        Label("Reopen", systemImage: "arrow.uturn.backward.circle")
                    }
                }
                .tint(.green)
                .disabled(isReopening)
            }
            .labelStyle(.titleAndIcon)
            .font(.caption)
            .padding()
            .background(.bar)
        }
    }

    // MARK: - Loading

    private func load(refresh: Bool = false) async {
        isLoading = true
        errorMessage = nil
        actionError = nil
        do {
            async let detailResult = api.issueDetail(owner: owner, repo: repo, number: number, refresh: refresh)
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
            switch await userResult {
            case .success(let user): currentUserLogin = user.login
            case .failure(let error): failures.append("user profile (\(error.localizedDescription))")
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
        isClosing = false
    }

    private func reopen() async {
        isReopening = true
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
        isReopening = false
    }

    private func deleteComment(_ comment: GitHubComment) async {
        isDeletingComment = true
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
        isDeletingComment = false
        deletingComment = nil
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
