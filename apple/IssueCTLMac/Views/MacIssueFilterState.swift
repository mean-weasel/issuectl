import Foundation

enum MacIssueFilter: String, CaseIterable, Identifiable {
    case drafts
    case open
    case running
    case unassigned
    case closed

    var id: String { rawValue }

    var title: String {
        switch self {
        case .drafts: "Drafts"
        case .open: "Open"
        case .running: "Running"
        case .unassigned: "Unassigned"
        case .closed: "Closed"
        }
    }
}

enum MacIssueSort: String, CaseIterable, Identifiable {
    case updated
    case created
    case priority

    var id: String { rawValue }

    var title: String {
        switch self {
        case .updated: "Updated"
        case .created: "Created"
        case .priority: "Priority"
        }
    }
}

struct MacRepoNameInput: Equatable {
    let owner: String
    let name: String

    var fullName: String { "\(owner)/\(name)" }

    static func parse(_ input: String) throws -> MacRepoNameInput {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = trimmed.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 2 else {
            throw MacRepoNameInputError.invalidFormat
        }

        let owner = String(parts[0]).trimmingCharacters(in: .whitespacesAndNewlines)
        let name = String(parts[1]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !owner.isEmpty, !name.isEmpty else {
            throw MacRepoNameInputError.invalidFormat
        }

        return MacRepoNameInput(owner: owner, name: name)
    }
}

enum MacRepoNameInputError: LocalizedError {
    case invalidFormat

    var errorDescription: String? {
        switch self {
        case .invalidFormat:
            "Enter a repository as owner/name."
        }
    }
}

@Observable @MainActor
final class MacIssueFilterState {
    private let preferences: MacSidebarDisplayPreferences
    private var knownRepoKeys = Set<String>()
    private var hasInitializedRepoSelection = false

    var searchText: String {
        didSet {
            preferences.issueSearchText = searchText
            visiblePageCount = 1
        }
    }

    var selectedFilter: MacIssueFilter {
        didSet {
            preferences.issueFilterRawValue = selectedFilter.rawValue
            visiblePageCount = 1
        }
    }

    var selectedRepoKeys: Set<String> {
        didSet {
            preferences.selectedRepoKeys = selectedRepoKeys
            visiblePageCount = 1
        }
    }

    var isRepoFilterExpanded: Bool {
        didSet { preferences.isRepoFilterExpanded = isRepoFilterExpanded }
    }

    var sortOrder: MacIssueSort {
        didSet {
            preferences.issueSortRawValue = sortOrder.rawValue
            visiblePageCount = 1
        }
    }

    var mineOnly: Bool {
        didSet {
            preferences.issueMineOnly = mineOnly
            visiblePageCount = 1
        }
    }

    var visiblePageCount = 1

    init(preferences: MacSidebarDisplayPreferences) {
        self.preferences = preferences
        selectedFilter = MacIssueFilter(rawValue: preferences.issueFilterRawValue) ?? .open
        selectedRepoKeys = preferences.selectedRepoKeys
        isRepoFilterExpanded = preferences.isRepoFilterExpanded
        sortOrder = MacIssueSort(rawValue: preferences.issueSortRawValue) ?? .updated
        mineOnly = preferences.issueMineOnly
        searchText = preferences.issueSearchText
    }

    func syncRepoSelection(repos: [Repo]) {
        let repoKeys = Set(repos.map(\.fullName))
        guard !repoKeys.isEmpty else {
            selectedRepoKeys.removeAll()
            knownRepoKeys.removeAll()
            hasInitializedRepoSelection = false
            return
        }

        if !hasInitializedRepoSelection {
            if selectedRepoKeys.isEmpty {
                selectedRepoKeys = repoKeys
            } else {
                selectedRepoKeys = selectedRepoKeys.intersection(repoKeys)
            }
            knownRepoKeys = repoKeys
            hasInitializedRepoSelection = true
            return
        }

        if selectedRepoKeys == knownRepoKeys {
            selectedRepoKeys = repoKeys
        } else {
            selectedRepoKeys = selectedRepoKeys.intersection(repoKeys)
        }
        knownRepoKeys = repoKeys
    }

    func selectAll(repos: [Repo]) {
        selectedRepoKeys = Set(repos.map(\.fullName))
    }

    func selectNone() {
        selectedRepoKeys.removeAll()
    }

    func resetPaging() {
        visiblePageCount = 1
    }

    func resetFilters(repos: [Repo]) {
        selectedFilter = .open
        sortOrder = .updated
        mineOnly = false
        searchText = ""
        selectAll(repos: repos)
        visiblePageCount = 1
    }
}

struct MacIssueListProjection {
    let issues: [MacIssueListItem]
    let drafts: [Draft]
    let counts: [MacIssueFilter: Int]
}

enum MacIssueListModel {
    static func project(
        issues: [MacIssueListItem],
        drafts: [Draft],
        sessions: [ActiveDeployment],
        selectedRepoKeys: Set<String>,
        section: MacIssueFilter,
        searchText: String,
        mineOnly: Bool,
        currentUserLogin: String?,
        priorities: [String: Priority],
        sortOrder: MacIssueSort
    ) -> MacIssueListProjection {
        let repoFiltered = issues.filter { item in
            selectedRepoKeys.contains(item.repoFullName) && matchesMine(item, mineOnly: mineOnly, currentUserLogin: currentUserLogin)
        }
        let counts = sectionCounts(issues: repoFiltered, drafts: drafts, sessions: sessions)
        let visibleIssues = filteredIssues(
            issues: repoFiltered,
            sessions: sessions,
            section: section,
            searchText: searchText,
            priorities: priorities,
            sortOrder: sortOrder
        )
        let visibleDrafts = filteredDrafts(drafts, searchText: searchText)

        return MacIssueListProjection(issues: visibleIssues, drafts: visibleDrafts, counts: counts)
    }

    static func sectionCounts(
        issues: [MacIssueListItem],
        drafts: [Draft],
        sessions: [ActiveDeployment]
    ) -> [MacIssueFilter: Int] {
        [
            .drafts: drafts.count,
            .open: issues.filter { $0.issue.isOpen && !isRunning($0, sessions: sessions) }.count,
            .running: issues.filter { $0.issue.isOpen && isRunning($0, sessions: sessions) }.count,
            .unassigned: issues.filter { $0.issue.isOpen && ($0.issue.assignees ?? []).isEmpty }.count,
            .closed: issues.filter { !$0.issue.isOpen }.count,
        ]
    }

    static func filteredIssues(
        issues: [MacIssueListItem],
        sessions: [ActiveDeployment],
        section: MacIssueFilter,
        searchText: String,
        priorities: [String: Priority],
        sortOrder: MacIssueSort
    ) -> [MacIssueListItem] {
        guard section != .drafts else { return [] }

        var items = issues.filter { item in
            switch section {
            case .drafts:
                return false
            case .open:
                return item.issue.isOpen && !isRunning(item, sessions: sessions)
            case .running:
                return item.issue.isOpen && isRunning(item, sessions: sessions)
            case .unassigned:
                return item.issue.isOpen && (item.issue.assignees ?? []).isEmpty
            case .closed:
                return !item.issue.isOpen
            }
        }

        let query = normalizedSearchText(searchText)
        if !query.isEmpty {
            items = items.filter { item in matchesSearch(item, query: query) }
        }

        return sorted(items, priorities: priorities, sortOrder: sortOrder)
    }

    static func filteredDrafts(_ drafts: [Draft], searchText: String) -> [Draft] {
        let query = normalizedSearchText(searchText)
        guard !query.isEmpty else { return drafts }
        return drafts.filter { draft in
            draft.title.lowercased().contains(query) || (draft.body ?? "").lowercased().contains(query)
        }
    }

    static func isRunning(_ item: MacIssueListItem, sessions: [ActiveDeployment]) -> Bool {
        sessions.contains { session in
            session.isActive &&
            session.owner == item.repo.owner &&
            session.repoName == item.repo.name &&
            session.issueNumber == item.issue.number
        }
    }

    static func priorityKey(for item: MacIssueListItem) -> String {
        "\(item.repo.owner)/\(item.repo.name)#\(item.issue.number)"
    }

    private static func sorted(
        _ items: [MacIssueListItem],
        priorities: [String: Priority],
        sortOrder: MacIssueSort
    ) -> [MacIssueListItem] {
        items.sorted { lhs, rhs in
            switch sortOrder {
            case .updated:
                return date(lhs.issue.updatedAt) != date(rhs.issue.updatedAt)
                    ? date(lhs.issue.updatedAt) > date(rhs.issue.updatedAt)
                    : stableTieBreak(lhs, rhs)
            case .created:
                return date(lhs.issue.createdAt) != date(rhs.issue.createdAt)
                    ? date(lhs.issue.createdAt) > date(rhs.issue.createdAt)
                    : stableTieBreak(lhs, rhs)
            case .priority:
                let lhsPriority = priorities[priorityKey(for: lhs)] ?? .normal
                let rhsPriority = priorities[priorityKey(for: rhs)] ?? .normal
                return lhsPriority.sortIndex != rhsPriority.sortIndex
                    ? lhsPriority.sortIndex < rhsPriority.sortIndex
                    : updatedTieBreak(lhs, rhs)
            }
        }
    }

    private static func matchesMine(_ item: MacIssueListItem, mineOnly: Bool, currentUserLogin: String?) -> Bool {
        guard mineOnly, let currentUserLogin else { return true }
        return item.issue.user?.login == currentUserLogin
    }

    private static func matchesSearch(_ item: MacIssueListItem, query: String) -> Bool {
        item.issue.title.lowercased().contains(query)
            || (item.issue.body ?? "").lowercased().contains(query)
            || item.repoFullName.lowercased().contains(query)
            || "#\(item.issue.number)".contains(query)
            || "\(item.issue.number)".contains(query)
    }

    private static func normalizedSearchText(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private static func date(_ value: String) -> Date {
        parseIssueCTLDate(value) ?? .distantPast
    }

    private static func updatedTieBreak(_ lhs: MacIssueListItem, _ rhs: MacIssueListItem) -> Bool {
        date(lhs.issue.updatedAt) != date(rhs.issue.updatedAt)
            ? date(lhs.issue.updatedAt) > date(rhs.issue.updatedAt)
            : stableTieBreak(lhs, rhs)
    }

    private static func stableTieBreak(_ lhs: MacIssueListItem, _ rhs: MacIssueListItem) -> Bool {
        if lhs.repoFullName != rhs.repoFullName {
            return lhs.repoFullName < rhs.repoFullName
        }
        return lhs.issue.number < rhs.issue.number
    }
}
