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

    // Detail actions state (#263, #264, #265)
    @State private var showEditSheet = false
    @State private var showLabelSheet = false
    @State private var editingComment: GitHubComment?
    @State private var deletingComment: GitHubComment?
    @State private var isDeletingComment = false

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

                    if let actionError {
                        Label(actionError, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .font(.subheadline)
                            .padding(.horizontal)
                            .padding(.vertical, 6)
                    }

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
                        Divider()
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
        .task { await load() }
    }

    // MARK: - Sections

    @ViewBuilder
    private func headerSection(_ issue: GitHubIssue) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(issue.title)
                .font(.title2.weight(.semibold))

            HStack(spacing: 8) {
                StateBadge(isOpen: issue.isOpen)

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
                    Text(deployment.state)
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
        do {
            detail = try await api.issueDetail(owner: owner, repo: repo, number: number, refresh: refresh)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func closeWithoutComment() async {
        isClosing = true
        actionError = nil
        do {
            let body = IssueStateRequestBody(state: "closed", comment: nil)
            let response = try await api.updateIssueState(owner: owner, repo: repo, number: number, body: body)
            if response.success {
                await load(refresh: true)
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
            } else {
                actionError = response.error ?? "Failed to delete comment"
            }
        } catch {
            actionError = error.localizedDescription
        }
        isDeletingComment = false
        deletingComment = nil
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
