import SwiftUI

struct TodaySearchSheet: View {
    @Environment(\.dismiss) private var dismiss
    @FocusState private var isSearchFocused: Bool

    let repos: [Repo]
    let issuesByRepo: [String: [GitHubIssue]]
    let pullsByRepo: [String: [GitHubPull]]
    let onSelect: (TodayDestination) -> Void

    @State private var query = ""

    private var issueResults: [TodayIssueSearchResult] {
        issuesByRepo.flatMap { repoFullName, issues in
            issues.compactMap { issue in
                guard todayMatchesSearchQuery(
                    query: query,
                    title: issue.title,
                    body: issue.body,
                    repoFullName: repoFullName,
                    number: issue.number
                ) else { return nil }
                return TodayIssueSearchResult(issue: issue, repo: repo(for: repoFullName))
            }
        }
        .sorted { $0.issue.updatedAt > $1.issue.updatedAt }
    }

    private var pullResults: [TodayPullSearchResult] {
        pullsByRepo.flatMap { repoFullName, pulls in
            pulls.compactMap { pull in
                guard todayMatchesSearchQuery(
                    query: query,
                    title: pull.title,
                    body: pull.body,
                    repoFullName: repoFullName,
                    number: pull.number
                ) else { return nil }
                return TodayPullSearchResult(pull: pull, repo: repo(for: repoFullName))
            }
        }
        .sorted { $0.pull.updatedAt > $1.pull.updatedAt }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                searchField

                if issueResults.isEmpty && pullResults.isEmpty {
                    ContentUnavailableView(
                        "No Results",
                        systemImage: "magnifyingglass",
                        description: Text("No issues or pull requests match this search.")
                    )
                    .frame(maxHeight: .infinity)
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 16) {
                            if !issueResults.isEmpty {
                                resultSection(title: "Issues") {
                                    ForEach(issueResults.prefix(12)) { result in
                                        issueResultRow(result)
                                    }
                                }
                            }

                            if !pullResults.isEmpty {
                                resultSection(title: "Pull Requests") {
                                    ForEach(pullResults.prefix(12)) { result in
                                        pullResultRow(result)
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 24)
                    }
                }
            }
            .padding(.top, 12)
            .navigationTitle("Search")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .accessibilityIdentifier("today-search-cancel-button")
                }
            }
        }
        .task { isSearchFocused = true }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Search issues and PRs", text: $query)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($isSearchFocused)
                .accessibilityIdentifier("today-search-field")
            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
                .accessibilityIdentifier("today-search-clear-button")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
        .padding(.horizontal, 16)
    }

    private func resultSection<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
            VStack(spacing: 8) {
                content()
            }
        }
    }

    private func issueResultRow(_ result: TodayIssueSearchResult) -> some View {
        Button {
            guard let repo = result.repo else { return }
            onSelect(.issue(owner: repo.owner, repo: repo.name, number: result.issue.number))
        } label: {
            TodaySearchRow(
                icon: "circle",
                iconColor: repoColor(for: result.repo),
                kicker: "\(result.repo?.fullName ?? "Unknown repo") - Issue #\(result.issue.number)",
                title: result.issue.title,
                detail: result.issue.timeAgo
            )
        }
        .buttonStyle(.plain)
        .disabled(result.repo == nil)
        .accessibilityIdentifier("today-search-issue-\(result.issue.number)")
    }

    private func pullResultRow(_ result: TodayPullSearchResult) -> some View {
        Button {
            guard let repo = result.repo else { return }
            onSelect(.pull(owner: repo.owner, repo: repo.name, number: result.pull.number))
        } label: {
            TodaySearchRow(
                icon: "arrow.triangle.merge",
                iconColor: IssueCTLColors.action,
                kicker: "\(result.repo?.fullName ?? "Unknown repo") - PR #\(result.pull.number)",
                title: result.pull.title,
                detail: relativeTime(for: result.pull.updatedAt)
            )
        }
        .buttonStyle(.plain)
        .disabled(result.repo == nil)
        .accessibilityIdentifier("today-search-pr-\(result.pull.number)")
    }

    private func repo(for fullName: String) -> Repo? {
        repos.first { $0.fullName == fullName }
    }

    private func repoColor(for repo: Repo?) -> Color {
        guard let repo, let index = repos.firstIndex(where: { $0.id == repo.id }) else { return .secondary }
        return RepoColors.color(for: index)
    }

    private func relativeTime(for timestamp: String) -> String {
        guard let date = parseIssueCTLDate(timestamp) else { return "" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

private struct TodaySearchRow: View {
    let icon: String
    let iconColor: Color
    let kicker: String
    let title: String
    let detail: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(iconColor)
                .frame(width: 22, height: 22)

            VStack(alignment: .leading, spacing: 4) {
                Text(kicker)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                if !detail.isEmpty {
                    Text(detail)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer(minLength: 8)

            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(12)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
    }
}

private struct TodayIssueSearchResult: Identifiable {
    let issue: GitHubIssue
    let repo: Repo?

    var id: String {
        "\(repo?.fullName ?? "unknown")-issue-\(issue.number)"
    }
}

private struct TodayPullSearchResult: Identifiable {
    let pull: GitHubPull
    let repo: Repo?

    var id: String {
        "\(repo?.fullName ?? "unknown")-pull-\(pull.number)"
    }
}
