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
