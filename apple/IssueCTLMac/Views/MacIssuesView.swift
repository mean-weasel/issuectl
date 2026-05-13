import SwiftUI

struct MacIssuesView: View {
    @Environment(\.macSidebarTextScale) private var textScale

    let store: MacSidebarStore

    @State private var searchText = ""
    @State private var selectedFilter: IssueFilter = .open
    @State private var selectedRepoIds = Set<Int>()
    @State private var knownRepoIds = Set<Int>()
    @State private var hasInitializedRepoSelection = false
    @State private var isRepoFilterExpanded = true
    @State private var visiblePageCount = 1
    @State private var selectedIssue: MacIssueListItem?

    private let pageSize = 50

    private var visibleIssues: [MacIssueListItem] {
        let filtered = store.issues.filter { item in
            let matchesRepo = selectedRepoIds.contains(item.repo.id)
            let matchesState = switch selectedFilter {
            case .open:
                item.issue.isOpen
            case .all:
                true
            case .unassigned:
                item.issue.isOpen && (item.issue.assignees ?? []).isEmpty
            }
            return matchesRepo && matchesState
        }

        guard !searchText.isEmpty else { return filtered }
        let query = searchText.lowercased()
        return filtered.filter { item in
            item.issue.title.lowercased().contains(query)
                || (item.issue.body ?? "").lowercased().contains(query)
                || item.repoFullName.lowercased().contains(query)
        }
    }

    private var pagedIssues: [MacIssueListItem] {
        Array(visibleIssues.prefix(visibleLimit))
    }

    private var visibleLimit: Int {
        max(pageSize, visiblePageCount * pageSize)
    }

    private var hasMoreIssues: Bool {
        visibleIssues.count > pagedIssues.count
    }

    private var repoFilterSummary: String {
        if store.repos.isEmpty {
            return "No repos"
        }
        if selectedRepoIds.isEmpty {
            return "No repos selected"
        }
        if selectedRepoIds.count == store.repos.count {
            return "All repos"
        }
        return "\(selectedRepoIds.count) of \(store.repos.count) repos"
    }

    var body: some View {
        VStack(spacing: 0) {
            controls

            if store.isLoading && store.issues.isEmpty {
                ProgressView("Loading issues...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage = store.errorMessage, store.issues.isEmpty {
                ContentUnavailableView("Could not load issues", systemImage: "wifi.exclamationmark", description: Text(errorMessage))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if visibleIssues.isEmpty {
                ContentUnavailableView(emptyTitle, systemImage: "tray", description: Text(emptyDescription))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(pagedIssues) { item in
                        Button {
                            selectedIssue = item
                        } label: {
                            MacIssueRow(item: item, isRunning: isRunning(item))
                        }
                        .buttonStyle(.plain)
                    }

                    if hasMoreIssues {
                        HStack {
                            Spacer()
                            Button {
                                visiblePageCount += 1
                            } label: {
                                Label("Show 50 More", systemImage: "chevron.down")
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            Spacer()
                        }
                        .padding(.vertical, 10)
                    } else if visibleIssues.count > pageSize {
                        Text("Showing all \(visibleIssues.count) matching issues")
                            .font(.macSidebar(size: 11, scale: textScale))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                    }
                }
                .listStyle(.plain)
            }
        }
        .onChange(of: searchText) { _, _ in resetPaging() }
        .onChange(of: selectedFilter) { _, _ in resetPaging() }
        .onChange(of: selectedRepoIds) { _, _ in resetPaging() }
        .onChange(of: store.issues.count) { _, _ in
            syncRepoSelection()
            resetPaging()
        }
        .onChange(of: store.repos.count) { _, _ in syncRepoSelection() }
        .onAppear { syncRepoSelection() }
        .sheet(item: $selectedIssue) { item in
            MacIssueDetailView(item: item, store: store)
        }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("Search issues", text: $searchText)
                .textFieldStyle(.roundedBorder)

            VStack(alignment: .leading, spacing: 6) {
                Text("Filters")
                    .font(.macSidebar(size: 11, weight: .semibold, scale: textScale))
                    .foregroundStyle(.secondary)

                Picker("Issue state", selection: $selectedFilter) {
                    ForEach(IssueFilter.allCases) { filter in
                        Text(filter.title).tag(filter)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }

            DisclosureGroup(isExpanded: $isRepoFilterExpanded) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Button("All") {
                            selectedRepoIds = Set(store.repos.map(\.id))
                        }
                        .controlSize(.small)

                        Button("None") {
                            selectedRepoIds.removeAll()
                        }
                        .controlSize(.small)

                        Spacer()
                    }

                    ForEach(store.repos) { repo in
                        Toggle(repo.fullName, isOn: repoBinding(repo))
                            .toggleStyle(.checkbox)
                            .font(.macSidebar(size: 12, scale: textScale))
                    }
                }
                .padding(.top, 4)
            } label: {
                HStack {
                    Text("Repositories")
                        .font(.macSidebar(size: 11, weight: .semibold, scale: textScale))
                    Spacer()
                    Text(repoFilterSummary)
                        .font(.macSidebar(size: 11, scale: textScale))
                        .foregroundStyle(.secondary)
                }
            }

            Text("Showing \(pagedIssues.count) of \(visibleIssues.count) matching issues")
                .font(.macSidebar(size: 11, scale: textScale))
                .foregroundStyle(.secondary)
        }
        .padding(12)
    }

    private func repoBinding(_ repo: Repo) -> Binding<Bool> {
        Binding(
            get: { selectedRepoIds.contains(repo.id) },
            set: { isSelected in
                if isSelected {
                    selectedRepoIds.insert(repo.id)
                } else {
                    selectedRepoIds.remove(repo.id)
                }
            }
        )
    }

    private func resetPaging() {
        visiblePageCount = 1
    }

    private func syncRepoSelection() {
        let repoIds = Set(store.repos.map(\.id))
        guard !repoIds.isEmpty else {
            selectedRepoIds.removeAll()
            knownRepoIds.removeAll()
            return
        }

        if !hasInitializedRepoSelection {
            selectedRepoIds = repoIds
            knownRepoIds = repoIds
            hasInitializedRepoSelection = true
            return
        }

        if selectedRepoIds == knownRepoIds {
            selectedRepoIds = repoIds
        } else {
            selectedRepoIds = selectedRepoIds.intersection(repoIds)
        }
        knownRepoIds = repoIds
    }

    private func isRunning(_ item: MacIssueListItem) -> Bool {
        store.sessions.contains { session in
            session.owner == item.repo.owner
                && session.repoName == item.repo.name
                && session.issueNumber == item.issue.number
                && session.isActive
        }
    }

    private var emptyTitle: String {
        searchText.isEmpty ? "No Issues" : "No Matches"
    }

    private var emptyDescription: String {
        if !searchText.isEmpty {
            return "Clear search to show visible issues."
        }
        if selectedRepoIds.isEmpty && !store.repos.isEmpty {
            return "Select at least one repository to show issues."
        }
        if selectedRepoIds.count < store.repos.count {
            return "No issues match the selected repositories."
        }
        switch selectedFilter {
        case .open:
            return "No open issues are visible in tracked repos."
        case .unassigned:
            return "Every visible open issue has an assignee."
        case .all:
            return "No issues are visible in tracked repos."
        }
    }
}

private enum IssueFilter: String, CaseIterable, Identifiable {
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

private struct MacIssueRow: View {
    @Environment(\.macSidebarTextScale) private var textScale

    let item: MacIssueListItem
    let isRunning: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(item.issue.title)
                    .font(.macSidebar(size: 14, weight: .medium, scale: textScale))
                    .lineLimit(2)
                if isRunning {
                    Image(systemName: "terminal.fill")
                        .foregroundStyle(.green)
                        .help("Session running")
                }
            }

            HStack(spacing: 8) {
                Text(item.repoFullName)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text("#\(item.issue.number)")
                    .foregroundStyle(.secondary)
                Spacer(minLength: 4)
                if !item.issue.labels.isEmpty {
                    Label("\(item.issue.labels.count)", systemImage: "tag")
                        .labelStyle(.titleAndIcon)
                        .foregroundStyle(.secondary)
                }
                if let assignees = item.issue.assignees, !assignees.isEmpty {
                    Label("\(assignees.count)", systemImage: "person")
                        .labelStyle(.titleAndIcon)
                        .foregroundStyle(.secondary)
                }
                if !item.issue.timeAgo.isEmpty {
                    Text(item.issue.timeAgo)
                        .foregroundStyle(.secondary)
                }
            }
            .font(.macSidebar(size: 12, scale: textScale))
        }
        .padding(.vertical, 6)
    }
}
