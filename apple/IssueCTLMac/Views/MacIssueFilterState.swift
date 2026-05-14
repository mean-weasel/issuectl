import Foundation

enum MacIssueFilter: String, CaseIterable, Identifiable {
    case open
    case unassigned
    case all

    var id: String { rawValue }

    var title: String {
        switch self {
        case .open: "Open"
        case .unassigned: "Unassigned"
        case .all: "All"
        }
    }
}

@Observable @MainActor
final class MacIssueFilterState {
    private let preferences: MacSidebarDisplayPreferences
    private var knownRepoKeys = Set<String>()
    private var hasInitializedRepoSelection = false

    var searchText = "" {
        didSet { visiblePageCount = 1 }
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

    var visiblePageCount = 1

    init(preferences: MacSidebarDisplayPreferences) {
        self.preferences = preferences
        selectedFilter = MacIssueFilter(rawValue: preferences.issueFilterRawValue) ?? .open
        selectedRepoKeys = preferences.selectedRepoKeys
        isRepoFilterExpanded = preferences.isRepoFilterExpanded
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
            if selectedRepoKeys.isEmpty && !preferences.hasSavedRepoSelection {
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
}
