import SwiftUI

struct PRDetailView: View {
    @Environment(APIClient.self) private var api
    let owner: String
    let repo: String
    let number: Int

    @State private var detail: PullDetailResponse?
    @State private var isLoading = true
    @State private var errorMessage: String?

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
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        headerSection(detail.pull)
                        branchSection(detail.pull)
                        bodySection(detail.pull)
                        if !detail.checks.isEmpty {
                            checksSection(detail.checks)
                        }
                        if !detail.files.isEmpty {
                            filesSection(detail.files)
                        }
                        if let linkedIssue = detail.linkedIssue {
                            linkedIssueSection(linkedIssue)
                        }
                    }
                    .padding()
                }
                .refreshable { await load(refresh: true) }
            }
        }
        .navigationTitle("#\(number)")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
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
                Text(body)
                    .font(.body)
                    .textSelection(.enabled)
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
