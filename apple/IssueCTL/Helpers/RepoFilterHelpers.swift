import Foundation

/// Filter items from a [repoFullName: [Item]] dictionary by selected repos and current user.
func filterItemsByRepo<Item>(
    _ itemsByRepo: [String: [Item]],
    repos: [Repo],
    selectedRepoIds: Set<Int>,
    mineOnly: Bool,
    currentUserLogin: String?,
    userLogin: (Item) -> String?
) -> [Item] {
    var items: [Item]
    if selectedRepoIds.isEmpty {
        items = itemsByRepo.values.flatMap { $0 }
    } else {
        let selectedNames = Set(repos.filter { selectedRepoIds.contains($0.id) }.map(\.fullName))
        items = itemsByRepo
            .filter { selectedNames.contains($0.key) }
            .values.flatMap { $0 }
    }
    if mineOnly, let login = currentUserLogin {
        items = items.filter { userLogin($0) == login }
    }
    return items
}

/// Look up the Repo that owns an item by matching its URL in the itemsByRepo dictionary.
func repoForItem<Item>(
    _ item: Item,
    in itemsByRepo: [String: [Item]],
    repos: [Repo],
    htmlUrl: (Item) -> String
) -> Repo? {
    let url = htmlUrl(item)
    for (repoFullName, items) in itemsByRepo {
        if items.contains(where: { htmlUrl($0) == url }) {
            return repos.first(where: { $0.fullName == repoFullName })
        }
    }
    return nil
}

/// Look up the index of the Repo that owns an item (for color assignment).
func repoIndexForItem<Item>(
    _ item: Item,
    in itemsByRepo: [String: [Item]],
    repos: [Repo],
    htmlUrl: (Item) -> String
) -> Int? {
    guard let repo = repoForItem(item, in: itemsByRepo, repos: repos, htmlUrl: htmlUrl) else {
        return nil
    }
    return repos.firstIndex(where: { $0.id == repo.id })
}

extension GitHubPull {
    var needsReviewAttention: Bool {
        isOpen && (checksStatus == "failure" || checksStatus == "pending")
    }
}

func todayIssueMetricLabel(currentUserLogin: String?, userFetchFailed: Bool) -> String {
    currentUserLogin == nil || userFetchFailed ? "open issues" : "assigned issues"
}

func todayAssignedIssues(_ issues: [GitHubIssue], currentUserLogin: String?) -> [GitHubIssue] {
    let openIssues = issues.filter(\.isOpen)
    guard let currentUserLogin else { return openIssues }
    return openIssues.filter { issue in
        (issue.assignees ?? []).contains { $0.login == currentUserLogin }
    }
}

func todayAttentionSubtitle(count: Int) -> String {
    count == 1 ? "1 item needs attention" : "\(count) items need attention"
}

func todayReviewPulls(_ pulls: [GitHubPull]) -> [GitHubPull] {
    pulls
        .filter(\.needsReviewAttention)
        .sorted { todayPullSortIndex($0) < todayPullSortIndex($1) }
}

func todayMatchesSearchQuery(
    query: String,
    title: String,
    body: String?,
    repoFullName: String?,
    number: Int
) -> Bool {
    let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !normalizedQuery.isEmpty else { return true }

    let searchableText = [
        title,
        body ?? "",
        repoFullName ?? "",
        "#\(number)",
        "\(number)",
    ]
    .joined(separator: " ")
    .lowercased()

    return searchableText.contains(normalizedQuery)
}

func todayPullSortIndex(_ pull: GitHubPull) -> Int {
    switch pull.checksStatus {
    case "failure": 0
    case "pending": 1
    default: 2
    }
}

func runningDeployment(
    for issue: GitHubIssue,
    in repoFullName: String,
    deployments: [ActiveDeployment]
) -> ActiveDeployment? {
    deployments.first {
        $0.isActive &&
        $0.repoFullName == repoFullName &&
        $0.issueNumber == issue.number
    }
}

func runningDeployment(
    owner: String,
    repo: String,
    number: Int,
    deployments: [ActiveDeployment]
) -> ActiveDeployment? {
    deployments.first {
        $0.isActive &&
        $0.owner == owner &&
        $0.repoName == repo &&
        $0.issueNumber == number
    }
}
