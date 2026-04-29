import SwiftUI

struct PRDetailView: View {
    @Environment(APIClient.self) private var api
    @Environment(\.openURL) private var openURL
    let owner: String
    let repo: String
    let number: Int

    @State private var detail: PullDetailResponse?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var isApproving = false
    @State private var isMerging = false
    @State private var showRequestChanges = false
    @State private var showCommentSheet = false
    @State private var showMergeConfirm = false
    @State private var actionError: String?

    var body: some View {
        Group {
            if isLoading && detail == nil {
                ProgressView("Loading pull request...")
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
                            headerSection(detail.pull)
                            branchSection(detail.pull)
                            bodySection(detail.pull)
                            if !detail.checks.isEmpty {
                                checksSection(detail.checks)
                            }
                            if !detail.reviews.isEmpty {
                                reviewsSection(detail.reviews)
                            }
                            if !detail.files.isEmpty {
                                filesSection(detail.files)
                            }
                            if let linkedIssue = detail.linkedIssue {
                                linkedIssueSection(linkedIssue)
                            }
                            if let actionError {
                                Label(actionError, systemImage: "exclamationmark.triangle")
                                    .foregroundStyle(.red)
                                    .font(.subheadline)
                                    .lineLimit(3)
                            }
                        }
                        .padding()
                    }
                    .refreshable { await load(refresh: true) }

                    actionBar(for: detail.pull)
                }
            }
        }
        .navigationTitle("#\(number)")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onAppear {
            actionError = nil
        }
        .sheet(isPresented: $showRequestChanges) {
            RequestChangesSheet(
                owner: owner, repo: repo, number: number,
                onSuccess: { Task { await load(refresh: true) } }
            )
        }
        .sheet(isPresented: $showCommentSheet) {
            CommentSheet(
                owner: owner, repo: repo, number: number,
                onSuccess: { Task { await load(refresh: true) } }
            )
        }
        .confirmationDialog("Merge Pull Request", isPresented: $showMergeConfirm, titleVisibility: .visible) {
            Button("Merge Commit") { Task { await merge(method: "merge") } }
            Button("Squash and Merge") { Task { await merge(method: "squash") } }
            Button("Rebase and Merge") { Task { await merge(method: "rebase") } }
        }
    }

    // MARK: - Sections

    @ViewBuilder
    private func headerSection(_ pull: GitHubPull) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(pull.title)
                .font(.title2.weight(.semibold))

            HStack(spacing: 8) {
                PRStateBadge(pull: pull)

                if let user = pull.user {
                    Text(user.login)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 12) {
                Label("+\(pull.additions)", systemImage: "plus")
                    .font(.subheadline)
                    .foregroundStyle(.green)
                Label("-\(pull.deletions)", systemImage: "minus")
                    .font(.subheadline)
                    .foregroundStyle(.red)
                Label("\(pull.changedFiles) file\(pull.changedFiles == 1 ? "" : "s")", systemImage: "doc")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func branchSection(_ pull: GitHubPull) -> some View {
        HStack(spacing: 4) {
            BranchLabel(name: pull.headRef)
            Image(systemName: "arrow.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
            BranchLabel(name: pull.baseRef)
        }
    }

    @ViewBuilder
    private func bodySection(_ pull: GitHubPull) -> some View {
        if let body = pull.body, !body.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Divider()
                MarkdownView(content: body)
            }
        }
    }

    @ViewBuilder
    private func checksSection(_ checks: [GitHubCheck]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            Label("Checks", systemImage: "checkmark.shield")
                .font(.headline)

            ForEach(checks) { check in
                HStack(spacing: 8) {
                    CheckStatusIcon(check: check)
                    Text(check.name)
                        .font(.subheadline)
                        .lineLimit(1)
                    Spacer()
                    if check.isPending {
                        ProgressView()
                            .controlSize(.small)
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    @ViewBuilder
    private func filesSection(_ files: [GitHubPullFile]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            Label("Changed Files", systemImage: "doc.text")
                .font(.headline)

            ForEach(files) { file in
                HStack(spacing: 8) {
                    FileStatusIcon(status: file.status)
                    Text(file.filename)
                        .font(.subheadline.monospaced())
                        .lineLimit(1)
                    Spacer()
                    Text("+\(file.additions) -\(file.deletions)")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 2)
            }
        }
    }

    @ViewBuilder
    private func linkedIssueSection(_ issue: GitHubIssue) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            Label("Linked Issue", systemImage: "link")
                .font(.headline)

            HStack(spacing: 6) {
                StateBadge(isOpen: issue.isOpen)
                Text("#\(issue.number)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(issue.title)
                    .font(.subheadline)
                    .lineLimit(2)
            }
            .padding(.vertical, 2)
        }
    }

    @ViewBuilder
    private func reviewsSection(_ reviews: [GitHubPullReview]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            Label("Reviews", systemImage: "eye")
                .font(.headline)

            ForEach(reviews) { review in
                HStack(spacing: 8) {
                    Image(systemName: reviewIcon(for: review.state))
                        .foregroundStyle(reviewColor(for: review.state))
                    if let user = review.user {
                        Text(user.login)
                            .font(.subheadline)
                    }
                    Text(reviewStateLabel(review.state))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .padding(.vertical, 2)
            }
        }
    }

    private func reviewIcon(for state: String) -> String {
        switch state {
        case "approved": "checkmark.circle.fill"
        case "changes_requested": "xmark.circle.fill"
        case "commented": "bubble.left.fill"
        case "dismissed": "minus.circle.fill"
        default: "questionmark.circle"
        }
    }

    private func reviewColor(for state: String) -> Color {
        switch state {
        case "approved": .green
        case "changes_requested": .red
        case "commented": .secondary
        case "dismissed": .orange
        default: .secondary
        }
    }

    private func reviewStateLabel(_ state: String) -> String {
        switch state {
        case "approved": "Approved"
        case "changes_requested": "Requested changes"
        case "commented": "Commented"
        case "dismissed": "Dismissed"
        default: state
        }
    }

    // MARK: - Action Bar

    private func actionBar(for pull: GitHubPull) -> some View {
        ThumbActionBar {
            if pull.isOpen && !pull.merged {
                Button {
                    showMergeConfirm = true
                } label: {
                    if isMerging {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Label("Merge", systemImage: "arrow.triangle.merge")
                            .font(.subheadline.weight(.bold))
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(IssueCTLColors.action)
                .disabled(isMerging)
                .accessibilityIdentifier("pr-detail-merge-button")
            } else {
                Button {
                    if let url = URL(string: pull.htmlUrl) {
                        openURL(url)
                    }
                } label: {
                    Label("Open GitHub", systemImage: "safari")
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(IssueCTLColors.action)
                .accessibilityIdentifier("pr-detail-open-github-button")
            }
        } secondary: {
            Menu {
                if pull.isOpen && !pull.merged {
                    Button {
                        Task { await approve() }
                    } label: {
                        if isApproving {
                            Label("Approving", systemImage: "hourglass")
                        } else {
                            Label("Approve", systemImage: "checkmark.circle")
                        }
                    }
                    .disabled(isApproving)

                    Button {
                        showRequestChanges = true
                    } label: {
                        Label("Request Changes", systemImage: "xmark.circle")
                    }
                }

                Button {
                    showCommentSheet = true
                } label: {
                    Label("Comment", systemImage: "bubble.left")
                }

                Divider()

                if let detail, let url = URL(string: detail.pull.htmlUrl) {
                    Button {
                        openURL(url)
                    } label: {
                        Label("Open on GitHub", systemImage: "safari")
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 44, height: 36)
            }
            .buttonStyle(.bordered)
            .accessibilityLabel("Pull request actions")
            .accessibilityIdentifier("pr-detail-actions-menu")
        }
        .padding(.bottom, 4)
    }

    // MARK: - Loading

    private func load(refresh: Bool = false) async {
        isLoading = true
        errorMessage = nil
        do {
            detail = try await api.pullDetail(owner: owner, repo: repo, number: number, refresh: refresh)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func approve() async {
        isApproving = true
        actionError = nil
        do {
            let body = ReviewRequestBody(event: "APPROVE", body: nil)
            let response = try await api.reviewPull(owner: owner, repo: repo, number: number, body: body)
            if response.success {
                await load(refresh: true)
            } else {
                actionError = response.error ?? "Failed to approve"
            }
        } catch {
            actionError = error.localizedDescription
        }
        isApproving = false
    }

    private func merge(method: String) async {
        isMerging = true
        actionError = nil
        do {
            let body = MergeRequestBody(mergeMethod: method)
            let response = try await api.mergePull(owner: owner, repo: repo, number: number, body: body)
            if response.success {
                await load(refresh: true)
            } else {
                actionError = response.error ?? "Merge failed"
            }
        } catch {
            actionError = error.localizedDescription
        }
        isMerging = false
    }
}

// MARK: - Supporting Views

private struct BranchLabel: View {
    let name: String

    var body: some View {
        Text(name)
            .font(.caption.monospaced())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(.fill.tertiary)
            .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}

private struct CheckStatusIcon: View {
    let check: GitHubCheck

    var body: some View {
        Image(systemName: icon)
            .foregroundStyle(color)
            .font(.subheadline)
    }

    private var icon: String {
        if check.isPending { return "clock" }
        if check.isPassing { return "checkmark.circle.fill" }
        if check.isFailing { return "xmark.circle.fill" }
        return "questionmark.circle"
    }

    private var color: Color {
        if check.isPending { return .orange }
        if check.isPassing { return .green }
        if check.isFailing { return .red }
        return .secondary
    }
}

private struct FileStatusIcon: View {
    let status: String

    var body: some View {
        Image(systemName: icon)
            .foregroundStyle(color)
            .font(.caption)
    }

    private var icon: String {
        switch status {
        case "added": "plus.circle.fill"
        case "removed": "minus.circle.fill"
        case "modified": "pencil.circle.fill"
        case "renamed": "arrow.right.circle.fill"
        default: "circle"
        }
    }

    private var color: Color {
        switch status {
        case "added": .green
        case "removed": .red
        case "modified": .orange
        case "renamed": .blue
        default: .secondary
        }
    }
}
