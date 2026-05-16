import SwiftUI

struct MacIssuesView: View {
    @Environment(\.macSidebarTextScale) private var textScale

    let store: MacSidebarStore
    @Bindable var filterState: MacIssueFilterState

    @State private var isFilterControlsExpanded = false
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

    private var pagedIssues: [MacIssueListItem] {
        Array(visibleIssues.prefix(visibleLimit))
    }

    private var visibleLimit: Int {
        max(pageSize, filterState.visiblePageCount * pageSize)
    }

    private var hasMoreIssues: Bool {
        visibleIssues.count > pagedIssues.count
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
            } else if visibleIssues.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(pagedIssues) { item in
                            Button {
                                selectedIssue = item
                            } label: {
                                MacIssueRow(
                                    item: item,
                                    isRunning: MacIssueListModel.isRunning(item, sessions: store.sessions),
                                    priority: store.priorities[MacIssueListModel.priorityKey(for: item)]
                                )
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("mac-issue-row-\(item.repoFullName)-\(item.issue.number)")

                            Divider()
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
                                .accessibilityIdentifier("mac-issues-load-more-button")
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
                    .padding(.horizontal, 8)
                }
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

    private var emptyState: some View {
        VStack(spacing: 12) {
            ContentUnavailableView(emptyTitle, systemImage: "tray", description: Text(emptyDescription))

            HStack(spacing: 8) {
                if !filterState.searchText.isEmpty {
                    Button("Clear Search") {
                        filterState.searchText = ""
                    }
                    .controlSize(.small)
                    .accessibilityIdentifier("mac-issues-empty-clear-search")
                }

                if shouldShowResetFiltersAction {
                    Button("Reset Filters") {
                        filterState.resetFilters(repos: store.repos)
                    }
                    .controlSize(.small)
                    .accessibilityIdentifier("mac-issues-empty-reset-filters")
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityIdentifier("mac-issues-empty-state")
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("Search issues", text: $filterState.searchText)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("mac-issues-search-field")

            MacIssueSidebarDisclosureSection(isExpanded: $isFilterControlsExpanded, accessibilityIdentifier: "mac-issues-filters-disclosure") {
                VStack(alignment: .leading, spacing: 8) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("State")
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
                }
                .padding(.top, 4)
            } label: {
                HStack {
                    Text("Filters")
                        .font(.macSidebar(size: 11, weight: .semibold, scale: textScale))
                    Spacer()
                    Text(issueFilterControlSummary)
                        .font(.macSidebar(size: 11, scale: textScale))
                        .foregroundStyle(.secondary)
                }
            }

            sectionCounts
            filterSummary

            MacIssueSidebarDisclosureSection(isExpanded: $filterState.isRepoFilterExpanded, accessibilityIdentifier: "mac-issues-repo-filter") {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Button("All") {
                            filterState.selectAll(repos: store.repos)
                        }
                        .controlSize(.small)
                        .accessibilityIdentifier("mac-issues-repo-filter-all")

                        Button("None") {
                            filterState.selectNone()
                        }
                        .controlSize(.small)
                        .accessibilityIdentifier("mac-issues-repo-filter-none")

                        Spacer()
                    }

                    ForEach(store.repos) { repo in
                        Toggle(repo.fullName, isOn: repoBinding(repo))
                            .toggleStyle(.checkbox)
                            .font(.macSidebar(size: 12, scale: textScale))
                            .accessibilityIdentifier("mac-issues-repo-filter-\(repo.fullName)")
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
                    .accessibilityIdentifier("mac-issues-pagination-summary")

                Spacer(minLength: 4)
            }

            if store.issuesFromCache {
                Label(MacCacheIndicatorModel.cachedBannerText(kind: "issues", cachedAt: store.issuesCachedAt), systemImage: "externaldrive.badge.clock")
                    .font(.macSidebar(size: 11, scale: textScale))
                    .foregroundStyle(.orange)
                    .accessibilityIdentifier("mac-issues-cached-banner")
            } else if let updatedText = MacCacheIndicatorModel.updatedText(cachedAt: store.issuesCachedAt) {
                Text(updatedText)
                    .font(.macSidebar(size: 11, scale: textScale))
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("mac-issues-cache-age")
            }
        }
        .padding(12)
    }

    private var sectionCounts: some View {
        HStack(spacing: 6) {
            ForEach(MacIssueFilter.allCases) { filter in
                Button {
                    filterState.selectedFilter = filter
                } label: {
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
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity)
                .accessibilityLabel("\(filter.title) issues, \(projection.counts[filter] ?? 0)")
                .accessibilityValue(filterState.selectedFilter == filter ? "Selected" : "")
                .accessibilityIdentifier("mac-issues-section-count-\(filter.rawValue)")
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

    private var issueFilterControlSummary: String {
        var parts = [filterState.selectedFilter.title, filterState.sortOrder.title]
        if filterState.mineOnly {
            parts.append("Mine")
        }
        return parts.joined(separator: " • ")
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

    private var shouldShowResetFiltersAction: Bool {
        filterState.mineOnly
            || filterState.selectedFilter != .open
            || filterState.sortOrder != .updated
            || filterState.selectedRepoKeys.count != store.repos.count
    }

    private var resultSummary: String {
        if !hasMoreIssues {
            return "Showing all \(visibleIssues.count) matching issues"
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

private extension Priority {
    var title: String {
        rawValue.capitalized
    }
}

private struct MacIssueSidebarDisclosureSection<Label: View, Content: View>: View {
    @Binding var isExpanded: Bool

    let accessibilityIdentifier: String
    @ViewBuilder var content: Content
    @ViewBuilder var label: Label

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                isExpanded.toggle()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .frame(width: 10)
                        .foregroundStyle(.secondary)
                    label
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier(accessibilityIdentifier)

            if isExpanded {
                content
                    .padding(.leading, 16)
            }
        }
    }
}
