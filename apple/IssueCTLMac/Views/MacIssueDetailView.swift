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
    @State private var isUpdatingState = false
    @State private var isUpdatingPriority = false
    @State private var errorMessage: String?

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
                ContentUnavailableView("Could not load issue", systemImage: "wifi.exclamationmark", description: Text(errorMessage))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        issueSummary
                        actionBar
                        issueBody
                        commentComposer
                        comments
                    }
                    .padding(16)
                }
            }
        }
        .frame(minWidth: 520, idealWidth: 620, minHeight: 560, idealHeight: 720)
        .task {
            await load(refresh: false)
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
            }
        }
    }

    private var actionBar: some View {
        HStack(spacing: 8) {
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

            Spacer()
        }
    }

    @ViewBuilder
    private var issueBody: some View {
        if let body = issue.body, !body.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Divider()
                Text("Description")
                    .font(.headline)
                Text(body)
                    .font(.body)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
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
                .disabled(commentBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmittingComment)
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
                        Text(comment.body)
                            .font(.body)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(10)
                    .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
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
            async let detailResult = store.issueDetail(api: api, item: item, refresh: refresh)
            async let priorityResult: Result<Priority, Error> = {
                do { return .success(try await api.getPriority(owner: item.repo.owner, repo: item.repo.name, number: item.issue.number)) }
                catch { return .failure(error) }
            }()

            detail = try await detailResult
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
