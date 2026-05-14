import SwiftUI

struct MacIssuesView: View {
    @Environment(\.macSidebarTextScale) private var textScale

    let store: MacSidebarStore
    @Bindable var filterState: MacIssueFilterState

    @State private var selectedIssue: MacIssueListItem?

    private let pageSize = 50

    private var projection: MacIssueListProjection {
        MacIssueListModel.project(
            issues: store.issues,
            drafts: store.drafts,
            sessions: store.sessions,
            selectedRepoKeys: filterState.selectedRepoKeys,
            section: filterState.selectedFilter,
            searchText: filterState.searchText,
            mineOnly: filterState.mineOnly,
            currentUserLogin: store.currentUserLogin,
            priorities: store.priorities,
            sortOrder: filterState.sortOrder
        )
    }

    private var visibleIssues: [MacIssueListItem] {
        projection.issues
    }

    private var visibleDrafts: [Draft] {
        projection.drafts
    }

    private var pagedIssues: [MacIssueListItem] {
        Array(visibleIssues.prefix(visibleLimit))
    }

    private var visibleLimit: Int {
        max(pageSize, filterState.visiblePageCount * pageSize)
    }

    private var hasMoreIssues: Bool {
        visibleIssues.count > pagedIssues.count
    }

    private var isShowingDrafts: Bool {
        filterState.selectedFilter == .drafts
    }

    private var repoFilterSummary: String {
        if store.repos.isEmpty {
            return "No repos"
        }
        if filterState.selectedRepoKeys.isEmpty {
            return "No repos selected"
        }
        if filterState.selectedRepoKeys.count == store.repos.count {
            return "All repos"
        }
        return "\(filterState.selectedRepoKeys.count) of \(store.repos.count) repos"
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
            } else if isShowingDrafts && visibleDrafts.isEmpty {
                ContentUnavailableView(emptyTitle, systemImage: "tray", description: Text(emptyDescription))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if !isShowingDrafts && visibleIssues.isEmpty {
                ContentUnavailableView(emptyTitle, systemImage: "tray", description: Text(emptyDescription))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if isShowingDrafts {
                List {
                    ForEach(visibleDrafts) { draft in
                        MacIssueDraftRow(draft: draft)
                            .accessibilityIdentifier("mac-draft-row-\(draft.id)")
                    }
                }
                .listStyle(.plain)
            } else {
                List {
                    ForEach(pagedIssues) { item in
                        Button {
                            selectedIssue = item
                        } label: {
                            MacIssueRow(
                                item: item,
                                isRunning: MacIssueListModel.isRunning(item, sessions: store.sessions),
                                priority: store.priorities[MacIssueListModel.priorityKey(for: item)]
                            )
                        }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("mac-issue-row-\(item.repoFullName)-\(item.issue.number)")
                    }

                    if hasMoreIssues {
                        HStack {
                            Spacer()
                            Button {
                                filterState.visiblePageCount += 1
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
        .onChange(of: store.issues.count) { _, _ in
            filterState.syncRepoSelection(repos: store.repos)
            filterState.resetPaging()
        }
        .onChange(of: store.repos.count) { _, _ in filterState.syncRepoSelection(repos: store.repos) }
        .onAppear { filterState.syncRepoSelection(repos: store.repos) }
        .sheet(item: $selectedIssue) { item in
            MacIssueDetailView(item: item, store: store)
        }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("Search issues", text: $filterState.searchText)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("mac-issues-search-field")

            VStack(alignment: .leading, spacing: 6) {
                Text("Filters")
                    .font(.macSidebar(size: 11, weight: .semibold, scale: textScale))
                    .foregroundStyle(.secondary)

                Picker("Issue state", selection: $filterState.selectedFilter) {
                    ForEach(MacIssueFilter.allCases) { filter in
                        Text(filter.title).tag(filter)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .accessibilityIdentifier("mac-issues-section-picker")
            }

            HStack(spacing: 8) {
                Picker("Sort", selection: $filterState.sortOrder) {
                    ForEach(MacIssueSort.allCases) { sort in
                        Text(sort.title).tag(sort)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .disabled(isShowingDrafts)
                .accessibilityIdentifier("mac-issues-sort-picker")

                Toggle("Mine", isOn: $filterState.mineOnly)
                    .toggleStyle(.checkbox)
                    .disabled(store.currentUserLogin == nil)
                    .help(mineHelpText)
                    .accessibilityIdentifier("mac-issues-mine-filter")

                Button("Reset") {
                    filterState.resetFilters(repos: store.repos)
                }
                .controlSize(.small)
                .accessibilityIdentifier("mac-issues-reset-filters-button")
            }
            .font(.macSidebar(size: 12, scale: textScale))

            sectionCounts
            filterSummary

            DisclosureGroup(isExpanded: $filterState.isRepoFilterExpanded) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Button("All") {
                            filterState.selectAll(repos: store.repos)
                        }
                        .controlSize(.small)

                        Button("None") {
                            filterState.selectNone()
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

            HStack(spacing: 8) {
                Text(resultSummary)
                    .font(.macSidebar(size: 11, scale: textScale))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                Spacer(minLength: 4)

                if hasMoreIssues && !isShowingDrafts {
                    Button {
                        filterState.visiblePageCount += 1
                    } label: {
                        Label("Show 50 More", systemImage: "chevron.down")
                    }
                    .labelStyle(.titleAndIcon)
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .accessibilityIdentifier("mac-issues-load-more-button")
                }
            }
        }
        .padding(12)
    }

    private var sectionCounts: some View {
        HStack(spacing: 6) {
            ForEach(MacIssueFilter.allCases) { filter in
                VStack(spacing: 2) {
                    Text("\(projection.counts[filter] ?? 0)")
                        .font(.macSidebar(size: 11, weight: .semibold, scale: textScale))
                    Text(filter.title)
                        .font(.macSidebar(size: 10, scale: textScale))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 5)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(filterState.selectedFilter == filter ? Color.accentColor.opacity(0.14) : Color(nsColor: .controlBackgroundColor))
                )
            }
        }
        .accessibilityIdentifier("mac-issues-section-counts")
    }

    private var filterSummary: some View {
        HStack(spacing: 6) {
            Label(repoFilterSummary, systemImage: "folder")
            if filterState.mineOnly {
                Label("Mine", systemImage: "person.crop.circle")
            }
            if !filterState.searchText.isEmpty {
                Label("Search", systemImage: "magnifyingglass")
            }
            if filterState.sortOrder != .updated {
                Label(filterState.sortOrder.title, systemImage: "arrow.up.arrow.down")
            }
        }
        .font(.macSidebar(size: 11, scale: textScale))
        .foregroundStyle(.secondary)
        .lineLimit(1)
        .accessibilityIdentifier("mac-issues-filter-summary")
    }

    private func repoBinding(_ repo: Repo) -> Binding<Bool> {
        Binding(
            get: { filterState.selectedRepoKeys.contains(repo.fullName) },
            set: { isSelected in
                if isSelected {
                    filterState.selectedRepoKeys.insert(repo.fullName)
                } else {
                    filterState.selectedRepoKeys.remove(repo.fullName)
                }
            }
        )
    }

    private var emptyTitle: String {
        filterState.searchText.isEmpty ? "No Issues" : "No Matches"
    }

    private var emptyDescription: String {
        if !filterState.searchText.isEmpty {
            return "Clear search to show visible issues."
        }
        if filterState.selectedRepoKeys.isEmpty && !store.repos.isEmpty {
            return "Select at least one repository to show issues."
        }
        if filterState.selectedRepoKeys.count < store.repos.count {
            return "No issues match the selected repositories."
        }
        switch filterState.selectedFilter {
        case .drafts:
            return "No drafts match the current filters."
        case .open:
            return "No open issues without running sessions are visible in tracked repos."
        case .running:
            return "No issues have active sessions."
        case .unassigned:
            return "Every visible open issue has an assignee."
        case .closed:
            return "No closed issues are visible in tracked repos."
        }
    }

    private var resultSummary: String {
        if isShowingDrafts {
            return "Showing \(visibleDrafts.count) matching drafts"
        }
        return "Showing \(pagedIssues.count) of \(visibleIssues.count) matching issues"
    }

    private var mineHelpText: String {
        if store.currentUserLogin != nil {
            return "Show issues opened by you"
        }
        if store.userFetchFailed {
            return "Current user could not be loaded"
        }
        return "Current user is unavailable"
    }
}

private struct MacIssueRow: View {
    @Environment(\.macSidebarTextScale) private var textScale

    let item: MacIssueListItem
    let isRunning: Bool
    let priority: Priority?

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
                if let priority, priority != .normal {
                    Label(priority.title, systemImage: "flag")
                        .labelStyle(.titleAndIcon)
                        .foregroundStyle(priority == .high ? .red : .secondary)
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

private struct MacIssueDraftRow: View {
    @Environment(\.macSidebarTextScale) private var textScale

    let draft: Draft

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(draft.title)
                    .font(.macSidebar(size: 14, weight: .medium, scale: textScale))
                    .lineLimit(2)
                if let priority = draft.priority, priority != .normal {
                    Text(priority.title)
                        .font(.macSidebar(size: 10, weight: .semibold, scale: textScale))
                        .foregroundStyle(priority == .high ? .red : .secondary)
                }
            }
            if let body = draft.body, !body.isEmpty {
                Text(body)
                    .font(.macSidebar(size: 12, scale: textScale))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 6)
    }
}

private extension Priority {
    var title: String {
        rawValue.capitalized
    }
}
