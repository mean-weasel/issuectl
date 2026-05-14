import SwiftUI

enum MacPullRequestSection: String, CaseIterable, Identifiable {
    case review
    case open
    case merged
    case closed

    var id: String { rawValue }

    var title: String {
        switch self {
        case .review: "Review"
        case .open: "Open"
        case .merged: "Merged"
        case .closed: "Closed"
        }
    }
}

enum MacPullRequestSort: String, CaseIterable, Identifiable {
    case updated
    case created

    var id: String { rawValue }

    var title: String {
        switch self {
        case .updated: "Updated"
        case .created: "Created"
        }
    }
}

struct MacPullRequestListItem: Identifiable {
    let pull: GitHubPull
    let repo: Repo
    let repoIndex: Int

    var id: String { pull.id }
    var repoFullName: String { repo.fullName }
}

struct MacPullRequestListProjection {
    let pulls: [MacPullRequestListItem]
    let counts: [MacPullRequestSection: Int]
}

enum MacPullRequestListModel {
    static func project(
        pulls: [MacPullRequestListItem],
        selectedRepoKeys: Set<String>,
        section: MacPullRequestSection,
        searchText: String,
        mineOnly: Bool,
        currentUserLogin: String?,
        sortOrder: MacPullRequestSort
    ) -> MacPullRequestListProjection {
        let repoFiltered = pulls.filter { item in
            selectedRepoKeys.contains(item.repoFullName) && matchesMine(item, mineOnly: mineOnly, currentUserLogin: currentUserLogin)
        }

        let counts = sectionCounts(pulls: repoFiltered)
        let visiblePulls = filteredPulls(
            pulls: repoFiltered,
            section: section,
            searchText: searchText,
            sortOrder: sortOrder
        )

        return MacPullRequestListProjection(pulls: visiblePulls, counts: counts)
    }

    static func sectionCounts(pulls: [MacPullRequestListItem]) -> [MacPullRequestSection: Int] {
        [
            .review: pulls.filter { $0.pull.macNeedsReviewAttention }.count,
            .open: pulls.filter { $0.pull.isOpen }.count,
            .merged: pulls.filter { !$0.pull.isOpen && $0.pull.merged }.count,
            .closed: pulls.filter { !$0.pull.isOpen && !$0.pull.merged }.count,
        ]
    }

    static func filteredPulls(
        pulls: [MacPullRequestListItem],
        section: MacPullRequestSection,
        searchText: String,
        sortOrder: MacPullRequestSort
    ) -> [MacPullRequestListItem] {
        var items = pulls.filter { item in
            switch section {
            case .review:
                return item.pull.macNeedsReviewAttention
            case .open:
                return item.pull.isOpen
            case .merged:
                return !item.pull.isOpen && item.pull.merged
            case .closed:
                return !item.pull.isOpen && !item.pull.merged
            }
        }

        let query = normalizedSearchText(searchText)
        if !query.isEmpty {
            items = items.filter { item in matchesSearch(item, query: query) }
        }

        return sorted(items, sortOrder: sortOrder)
    }

    private static func matchesMine(_ item: MacPullRequestListItem, mineOnly: Bool, currentUserLogin: String?) -> Bool {
        guard mineOnly, let currentUserLogin else { return true }
        return item.pull.user?.login == currentUserLogin
    }

    private static func matchesSearch(_ item: MacPullRequestListItem, query: String) -> Bool {
        item.pull.title.lowercased().contains(query)
            || (item.pull.body ?? "").lowercased().contains(query)
            || item.repoFullName.lowercased().contains(query)
            || "#\(item.pull.number)".contains(query)
            || "\(item.pull.number)".contains(query)
    }

    private static func sorted(_ items: [MacPullRequestListItem], sortOrder: MacPullRequestSort) -> [MacPullRequestListItem] {
        items.sorted { lhs, rhs in
            switch sortOrder {
            case .updated:
                return date(lhs.pull.updatedAt) != date(rhs.pull.updatedAt)
                    ? date(lhs.pull.updatedAt) > date(rhs.pull.updatedAt)
                    : stableTieBreak(lhs, rhs)
            case .created:
                return date(lhs.pull.createdAt) != date(rhs.pull.createdAt)
                    ? date(lhs.pull.createdAt) > date(rhs.pull.createdAt)
                    : stableTieBreak(lhs, rhs)
            }
        }
    }

    private static func normalizedSearchText(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private static func date(_ value: String) -> Date {
        parseIssueCTLDate(value) ?? .distantPast
    }

    private static func stableTieBreak(_ lhs: MacPullRequestListItem, _ rhs: MacPullRequestListItem) -> Bool {
        if lhs.repoFullName != rhs.repoFullName {
            return lhs.repoFullName < rhs.repoFullName
        }
        return lhs.pull.number < rhs.pull.number
    }
}

struct MacPullRequestsView: View {
    @Environment(APIClient.self) private var api
    @Environment(\.macSidebarTextScale) private var textScale

    let store: MacSidebarStore

    @State private var pulls: [MacPullRequestListItem] = []
    @State private var selectedSection: MacPullRequestSection = .review
    @State private var selectedRepoKeys = Set<String>()
    @State private var knownRepoKeys = Set<String>()
    @State private var searchText = ""
    @State private var mineOnly = false
    @State private var sortOrder: MacPullRequestSort = .updated
    @State private var isRepoFilterExpanded = true
    @State private var visiblePageCount = 1
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var isShowingCachedData = false
    @State private var oldestCachedAt: Date?
    @State private var selectedPull: MacPullRequestListItem?

    private let pageSize = 3

    private var projection: MacPullRequestListProjection {
        MacPullRequestListModel.project(
            pulls: pulls,
            selectedRepoKeys: selectedRepoKeys,
            section: selectedSection,
            searchText: searchText,
            mineOnly: mineOnly,
            currentUserLogin: store.currentUserLogin,
            sortOrder: sortOrder
        )
    }

    private var visiblePulls: [MacPullRequestListItem] {
        projection.pulls
    }

    private var pagedPulls: [MacPullRequestListItem] {
        Array(visiblePulls.prefix(visibleLimit))
    }

    private var visibleLimit: Int {
        max(pageSize, visiblePageCount * pageSize)
    }

    private var hasMorePulls: Bool {
        visiblePulls.count > pagedPulls.count
    }

    private var repoFilterSummary: String {
        if store.repos.isEmpty {
            return "No repos"
        }
        if selectedRepoKeys.isEmpty {
            return "No repos selected"
        }
        if selectedRepoKeys.count == store.repos.count {
            return "All repos"
        }
        return "\(selectedRepoKeys.count) of \(store.repos.count) repos"
    }

    var body: some View {
        VStack(spacing: 0) {
            controls

            if isLoading && pulls.isEmpty {
                ProgressView("Loading pull requests...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage, pulls.isEmpty {
                ContentUnavailableView("Could not load pull requests", systemImage: "wifi.exclamationmark", description: Text(errorMessage))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityIdentifier("mac-prs-load-error")
            } else if visiblePulls.isEmpty {
                ContentUnavailableView(emptyTitle, systemImage: "arrow.triangle.merge", description: Text(emptyDescription))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(pagedPulls) { item in
                            Button {
                                selectedPull = item
                            } label: {
                                MacPullRequestRow(item: item)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("mac-pr-row-\(item.repoFullName)-\(item.pull.number)")

                            Divider()
                        }

                        if hasMorePulls {
                            HStack {
                                Spacer()
                                Button {
                                    visiblePageCount += 1
                                } label: {
                                    Label("Show \(pageSize) More", systemImage: "chevron.down")
                                }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                                .accessibilityIdentifier("mac-prs-load-more-button")
                                Spacer()
                            }
                            .padding(.vertical, 10)
                        } else if visiblePulls.count > pageSize {
                            Text("Showing all \(visiblePulls.count) matching pull requests")
                                .font(.macSidebar(size: 11, scale: textScale))
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .accessibilityIdentifier("mac-prs-pagination-summary")
                        }
                    }
                    .padding(.horizontal, 8)
                }
            }
        }
        .task { await loadPulls(refresh: false) }
        .onChange(of: store.repos.count) { _, _ in syncRepoSelection() }
        .onChange(of: selectedSection) { _, _ in resetPaging() }
        .onChange(of: selectedRepoKeys) { _, _ in resetPaging() }
        .onChange(of: searchText) { _, _ in resetPaging() }
        .onChange(of: mineOnly) { _, _ in resetPaging() }
        .onChange(of: sortOrder) { _, _ in resetPaging() }
        .sheet(item: $selectedPull) { item in
            MacPullRequestDetailView(item: item)
        }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("Search pull requests", text: $searchText)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("mac-prs-search-field")

            VStack(alignment: .leading, spacing: 6) {
                Text("Sections")
                    .font(.macSidebar(size: 11, weight: .semibold, scale: textScale))
                    .foregroundStyle(.secondary)

                Picker("Pull request section", selection: $selectedSection) {
                    ForEach(MacPullRequestSection.allCases) { section in
                        Text(section.title).tag(section)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .accessibilityIdentifier("mac-prs-section-picker")
            }

            HStack(spacing: 8) {
                Picker("Sort", selection: $sortOrder) {
                    ForEach(MacPullRequestSort.allCases) { sort in
                        Text(sort.title).tag(sort)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .accessibilityIdentifier("mac-prs-sort-picker")

                Toggle("Mine", isOn: $mineOnly)
                    .toggleStyle(.checkbox)
                    .disabled(store.currentUserLogin == nil)
                    .help(store.currentUserLogin == nil ? "Sign in is required for this filter." : "Show pull requests opened by you.")
                    .accessibilityIdentifier("mac-prs-mine-filter")

                Button("Reset") {
                    resetFilters()
                }
                .controlSize(.small)
                .accessibilityIdentifier("mac-prs-reset-filters-button")
            }
            .font(.macSidebar(size: 12, scale: textScale))

            sectionCounts
            filterSummary

            DisclosureGroup(isExpanded: $isRepoFilterExpanded) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Button("All") {
                            selectedRepoKeys = Set(store.repos.map(\.fullName))
                        }
                        .controlSize(.small)

                        Button("None") {
                            selectedRepoKeys.removeAll()
                        }
                        .controlSize(.small)

                        Spacer()
                    }

                    ForEach(store.repos) { repo in
                        Toggle(repo.fullName, isOn: repoBinding(repo))
                            .toggleStyle(.checkbox)
                            .font(.macSidebar(size: 12, scale: textScale))
                            .accessibilityIdentifier("mac-prs-repo-filter-\(repo.fullName)")
                    }
                }
                .padding(.top, 4)
            } label: {
                HStack {
                    Text("Repositories")
                    Spacer()
                    Text(repoFilterSummary)
                        .foregroundStyle(.secondary)
                }
                .font(.macSidebar(size: 12, weight: .semibold, scale: textScale))
            }
            .accessibilityIdentifier("mac-prs-repo-filter")

            if isShowingCachedData {
                Label("Showing cached pull requests", systemImage: "externaldrive.badge.clock")
                    .font(.macSidebar(size: 11, scale: textScale))
                    .foregroundStyle(.orange)
                    .accessibilityIdentifier("mac-prs-cached-banner")
            } else if let oldestCachedAt {
                Text("Updated \(oldestCachedAt.formatted(date: .omitted, time: .shortened))")
                    .font(.macSidebar(size: 11, scale: textScale))
                    .foregroundStyle(.secondary)
            }

            if let errorMessage, !pulls.isEmpty {
                MacRecoveryBanner(message: errorMessage, actionTitle: "Retry", isActionDisabled: isLoading) {
                    Task { await loadPulls(refresh: true) }
                }
                .accessibilityIdentifier("mac-prs-inline-error")
            }
        }
        .padding(12)
        .background(Color(nsColor: .controlBackgroundColor))
    }

    private var sectionCounts: some View {
        HStack(spacing: 6) {
            ForEach(MacPullRequestSection.allCases) { section in
                let count = projection.counts[section] ?? 0
                Text("\(section.title) \(count)")
                    .font(.macSidebar(size: 11, weight: selectedSection == section ? .semibold : .regular, scale: textScale))
                    .foregroundStyle(selectedSection == section ? .primary : .secondary)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(selectedSection == section ? Color.accentColor.opacity(0.14) : Color.secondary.opacity(0.08), in: Capsule())
            }
        }
        .accessibilityIdentifier("mac-prs-section-counts")
    }

    private var filterSummary: some View {
        Text("Showing \(selectedSection.title.lowercased()) PRs • \(repoFilterSummary) • \(sortOrder.title)")
            .font(.macSidebar(size: 11, scale: textScale))
            .foregroundStyle(.secondary)
            .lineLimit(2)
            .accessibilityIdentifier("mac-prs-filter-summary")
    }

    private var emptyTitle: String {
        searchText.isEmpty ? "No Pull Requests" : "No Matching Pull Requests"
    }

    private var emptyDescription: String {
        if !searchText.isEmpty {
            return "No \(selectedSection.title.lowercased()) pull requests match \"\(searchText)\"."
        }
        return "No \(selectedSection.title.lowercased()) pull requests match the current filters."
    }

    private func loadPulls(refresh: Bool) async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        if store.repos.isEmpty {
            await store.load(api: api, refresh: refresh)
        }
        syncRepoSelection()

        var loadedPulls: [MacPullRequestListItem] = []
        var failures: [String] = []
        var cachedDates: [Date] = []
        var didUseCachedData = false

        for (index, repo) in store.repos.enumerated() {
            do {
                let response = try await api.pulls(owner: repo.owner, repo: repo.name, refresh: refresh)
                loadedPulls.append(contentsOf: response.pulls.map { pull in
                    MacPullRequestListItem(pull: pull, repo: repo, repoIndex: index)
                })
                didUseCachedData = didUseCachedData || response.fromCache
                if let cachedAt = response.cachedAt, let date = parseIssueCTLDate(cachedAt) {
                    cachedDates.append(date)
                }
            } catch {
                failures.append("\(repo.fullName): \(error.localizedDescription)")
            }
        }

        pulls = loadedPulls
        oldestCachedAt = cachedDates.min()
        isShowingCachedData = didUseCachedData
        if !failures.isEmpty {
            errorMessage = "Some repos failed to load pull requests: \(failures.joined(separator: "; "))"
        }
    }

    private func syncRepoSelection() {
        let repoKeys = Set(store.repos.map(\.fullName))
        guard !repoKeys.isEmpty else {
            selectedRepoKeys.removeAll()
            knownRepoKeys.removeAll()
            return
        }

        if knownRepoKeys.isEmpty {
            selectedRepoKeys = repoKeys
        } else if selectedRepoKeys == knownRepoKeys {
            selectedRepoKeys = repoKeys
        } else {
            selectedRepoKeys = selectedRepoKeys.intersection(repoKeys)
        }
        knownRepoKeys = repoKeys
    }

    private func resetFilters() {
        selectedSection = .review
        selectedRepoKeys = Set(store.repos.map(\.fullName))
        searchText = ""
        mineOnly = false
        sortOrder = .updated
        resetPaging()
    }

    private func resetPaging() {
        visiblePageCount = 1
    }

    private func repoBinding(_ repo: Repo) -> Binding<Bool> {
        Binding(
            get: { selectedRepoKeys.contains(repo.fullName) },
            set: { isSelected in
                if isSelected {
                    selectedRepoKeys.insert(repo.fullName)
                } else {
                    selectedRepoKeys.remove(repo.fullName)
                }
            }
        )
    }
}

private struct MacPullRequestRow: View {
    @Environment(\.macSidebarTextScale) private var textScale

    let item: MacPullRequestListItem

    var body: some View {
        HStack(alignment: .top, spacing: 9) {
            RoundedRectangle(cornerRadius: 3)
                .fill(MacPullRepoColors.color(for: item.repoIndex))
                .frame(width: 5, height: 42)
                .padding(.top, 3)

            VStack(alignment: .leading, spacing: 4) {
                Text(item.pull.title)
                    .font(.macSidebar(size: 13, weight: .semibold, scale: textScale))
                    .lineLimit(2)

                HStack(spacing: 6) {
                    Text("\(item.repoFullName)#\(item.pull.number)")
                    if let login = item.pull.user?.login {
                        Text(login)
                    }
                    Text(item.pull.diffSummary)
                }
                .font(.macSidebar(size: 11, scale: textScale))
                .foregroundStyle(.secondary)
                .lineLimit(1)

                HStack(spacing: 6) {
                    MacPullRequestStateBadge(pull: item.pull)
                    MacChecksStatusBadge(status: item.pull.checksStatus)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 7)
        .padding(.horizontal, 6)
    }
}

private struct MacPullRequestStateBadge: View {
    let pull: GitHubPull

    private var label: String {
        if pull.merged { return "Merged" }
        return pull.isOpen ? "Open" : "Closed"
    }

    private var color: Color {
        if pull.merged { return .purple }
        return pull.isOpen ? .green : .red
    }

    var body: some View {
        Text(label)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.14), in: Capsule())
    }
}

private struct MacChecksStatusBadge: View {
    let status: String?

    private var label: String {
        switch status {
        case "success": "Passing"
        case "failure": "Failing"
        case "pending": "Pending"
        default: "Unknown"
        }
    }

    private var color: Color {
        switch status {
        case "success": .green
        case "failure": .red
        case "pending": .orange
        default: .secondary
        }
    }

    var body: some View {
        if status != nil {
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(color)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(color.opacity(0.14), in: Capsule())
        }
    }
}

private struct MacPullRequestDetailView: View {
    @Environment(APIClient.self) private var api
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @Environment(\.macSidebarTextScale) private var textScale

    let item: MacPullRequestListItem

    @State private var detail: PullDetailResponse?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var actionError: String?
    @State private var successMessage: String?
    @State private var isSubmittingAction = false
    @State private var textAction: MacPullRequestTextAction?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()

            if isLoading && detail == nil {
                ProgressView("Loading pull request...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage, detail == nil {
                ContentUnavailableView("Could not load pull request", systemImage: "wifi.exclamationmark", description: Text(errorMessage))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityIdentifier("mac-pr-detail-error")
            } else if let detail {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        MacPullRequestDetailHeader(detail: detail)
                        if canMutate(detail.pull) {
                            actionBar
                        }
                        if let successMessage {
                            Label(successMessage, systemImage: "checkmark.circle")
                                .font(.macSidebar(size: 12, weight: .semibold, scale: textScale))
                                .foregroundStyle(.green)
                                .accessibilityIdentifier("mac-pr-detail-success-message")
                        }
                        if let actionError {
                            Text(actionError)
                                .font(.macSidebar(size: 12, scale: textScale))
                                .foregroundStyle(.red)
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityIdentifier("mac-pr-detail-action-error")
                        }
                        if let body = detail.pull.body, !body.isEmpty {
                            MacDetailSection(title: "Description", systemImage: "text.alignleft") {
                                Text(body)
                                    .font(.macSidebar(size: 12, scale: textScale))
                                    .textSelection(.enabled)
                            }
                            .accessibilityIdentifier("mac-pr-detail-body")
                        }
                        MacDetailSection(title: "Checks", systemImage: "checkmark.shield") {
                            ForEach(detail.checks) { check in
                                detailRow(title: check.name, value: check.conclusion ?? check.status)
                                    .accessibilityIdentifier("mac-pr-detail-check-\(check.name)")
                            }
                        }
                        MacDetailSection(title: "Changed Files", systemImage: "doc.text") {
                            ForEach(detail.files) { file in
                                detailRow(title: file.filename, value: "+\(file.additions) -\(file.deletions)")
                                    .accessibilityIdentifier("mac-pr-detail-file-\(file.filename)")
                            }
                        }
                        if !detail.reviews.isEmpty {
                            MacDetailSection(title: "Reviews", systemImage: "eye") {
                                ForEach(detail.reviews) { review in
                                    detailRow(title: review.user?.login ?? "Unknown", value: review.state)
                                        .accessibilityIdentifier("mac-pr-detail-review-\(review.id)")
                                }
                            }
                        }
                        if let issue = detail.linkedIssue {
                            MacDetailSection(title: "Linked Issue", systemImage: "link") {
                                detailRow(title: "#\(issue.number)", value: issue.title)
                                    .accessibilityIdentifier("mac-pr-detail-linked-issue-\(issue.number)")
                            }
                        }
                    }
                    .padding(14)
                }
                .accessibilityIdentifier("mac-pr-detail")
            }
        }
        .frame(width: 560, height: 620)
        .task { await load(refresh: false) }
        .sheet(item: $textAction) { action in
            MacPullRequestTextActionSheet(action: action) { body in
                switch action {
                case .comment:
                    return await submitComment(body)
                case .requestChanges:
                    return await submitReview(event: "REQUEST_CHANGES", body: body, successMessage: "Changes requested")
                }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Pull Request #\(item.pull.number)")
                    .font(.headline)
                Text(item.repoFullName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if let url = URL(string: item.pull.htmlUrl) {
                Button {
                    openURL(url)
                } label: {
                    Label("Open GitHub", systemImage: "safari")
                }
                .accessibilityIdentifier("mac-pr-detail-open-github-button")
            }
            Button("Done") {
                dismiss()
            }
            .keyboardShortcut(.cancelAction)
            .accessibilityIdentifier("mac-pr-detail-done-button")
        }
        .padding(14)
    }

    private var actionBar: some View {
        HStack(spacing: 8) {
            Button {
                textAction = .comment
            } label: {
                Label("Comment", systemImage: "bubble.left")
            }
            .controlSize(.small)
            .accessibilityIdentifier("mac-pr-detail-comment-button")

            Button {
                Task { await approve() }
            } label: {
                if isSubmittingAction {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Label("Approve", systemImage: "checkmark.circle")
                }
            }
            .controlSize(.small)
            .disabled(isSubmittingAction)
            .accessibilityIdentifier("mac-pr-detail-approve-button")

            Button {
                textAction = .requestChanges
            } label: {
                Label("Request Changes", systemImage: "xmark.circle")
            }
            .controlSize(.small)
            .accessibilityIdentifier("mac-pr-detail-request-changes-button")

            Menu {
                Button("Merge Commit") {
                    Task { await merge(method: "merge", label: "Merge commit") }
                }
                .accessibilityIdentifier("mac-pr-detail-merge-merge-button")

                Button("Squash and Merge") {
                    Task { await merge(method: "squash", label: "Squash merge") }
                }
                .accessibilityIdentifier("mac-pr-detail-merge-squash-button")

                Button("Rebase and Merge") {
                    Task { await merge(method: "rebase", label: "Rebase merge") }
                }
                .accessibilityIdentifier("mac-pr-detail-merge-rebase-button")
            } label: {
                Label("Merge", systemImage: "arrow.triangle.merge")
            }
            .controlSize(.small)
            .disabled(isSubmittingAction)
            .accessibilityIdentifier("mac-pr-detail-merge-menu")
        }
        .font(.macSidebar(size: 12, scale: textScale))
    }

    private func load(refresh: Bool) async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            detail = try await api.pullDetail(owner: item.repo.owner, repo: item.repo.name, number: item.pull.number, refresh: refresh)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func canMutate(_ pull: GitHubPull) -> Bool {
        pull.isOpen && !pull.merged
    }

    private func approve() async {
        await submitAction {
            await submitReview(event: "APPROVE", body: nil, successMessage: "Pull request approved")
        }
    }

    private func merge(method: String, label: String) async {
        await submitAction {
            do {
                let response = try await api.mergePull(
                    owner: item.repo.owner,
                    repo: item.repo.name,
                    number: item.pull.number,
                    body: MergeRequestBody(mergeMethod: method)
                )
                guard response.success else {
                    return response.error ?? "Failed to merge pull request"
                }
                successMessage = "\(label) complete"
                await load(refresh: true)
                return nil
            } catch {
                return error.localizedDescription
            }
        }
    }

    private func submitAction(_ action: () async -> String?) async {
        guard !isSubmittingAction else { return }
        isSubmittingAction = true
        actionError = nil
        successMessage = nil
        defer { isSubmittingAction = false }

        if let error = await action() {
            actionError = error
        }
    }

    private func submitComment(_ body: String) async -> String? {
        actionError = nil
        successMessage = nil
        do {
            let response = try await api.commentOnPull(
                owner: item.repo.owner,
                repo: item.repo.name,
                number: item.pull.number,
                body: PullCommentRequestBody(body: body)
            )
            guard response.success else {
                return response.error ?? "Failed to add comment"
            }
            successMessage = "Comment posted"
            await load(refresh: true)
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    private func submitReview(event: String, body: String?, successMessage: String) async -> String? {
        do {
            let response = try await api.reviewPull(
                owner: item.repo.owner,
                repo: item.repo.name,
                number: item.pull.number,
                body: ReviewRequestBody(event: event, body: body)
            )
            guard response.success else {
                return response.error ?? "Failed to submit review"
            }
            self.successMessage = successMessage
            await load(refresh: true)
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    private func detailRow(title: String, value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title)
                .font(.macSidebar(size: 12, weight: .semibold, scale: textScale))
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(value)
                .font(.macSidebar(size: 11, scale: textScale))
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
    }
}

private enum MacPullRequestTextAction: String, Identifiable {
    case comment
    case requestChanges

    var id: String { rawValue }

    var title: String {
        switch self {
        case .comment: "Comment"
        case .requestChanges: "Request Changes"
        }
    }

    var placeholder: String {
        switch self {
        case .comment: "Add a pull request comment"
        case .requestChanges: "Describe the required changes"
        }
    }

    var submitTitle: String {
        switch self {
        case .comment: "Post Comment"
        case .requestChanges: "Submit Review"
        }
    }

    var accessibilityPrefix: String {
        switch self {
        case .comment: "mac-pr-comment"
        case .requestChanges: "mac-pr-request-changes"
        }
    }
}

private struct MacPullRequestTextActionSheet: View {
    @Environment(\.dismiss) private var dismiss

    let action: MacPullRequestTextAction
    let submit: (String) async -> String?

    @State private var bodyText = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(action.title)
                .font(.headline)

            TextEditor(text: $bodyText)
                .font(.body)
                .frame(minHeight: 140)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color.secondary.opacity(0.25))
                )
                .accessibilityIdentifier("\(action.accessibilityPrefix)-body-field")

            if bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(action.placeholder)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("\(action.accessibilityPrefix)-error")
            }

            HStack {
                Spacer()
                Button("Cancel") {
                    dismiss()
                }
                Button {
                    Task { await submitBody() }
                } label: {
                    if isSubmitting {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text(action.submitTitle)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmitting)
                .accessibilityIdentifier("\(action.accessibilityPrefix)-submit-button")
            }
        }
        .padding(18)
        .frame(width: 420)
    }

    private func submitBody() async {
        guard !isSubmitting else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        let trimmed = bodyText.trimmingCharacters(in: .whitespacesAndNewlines)
        if let error = await submit(trimmed) {
            errorMessage = error
        } else {
            dismiss()
        }
    }
}

private struct MacPullRequestDetailHeader: View {
    @Environment(\.macSidebarTextScale) private var textScale

    let detail: PullDetailResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(detail.pull.title)
                .font(.macSidebar(size: 17, weight: .semibold, scale: textScale))
                .lineLimit(3)
                .accessibilityIdentifier("mac-pr-detail-title")

            HStack(spacing: 8) {
                MacPullRequestStateBadge(pull: detail.pull)
                MacChecksStatusBadge(status: detail.pull.checksStatus)
                if let login = detail.pull.user?.login {
                    Text(login)
                        .font(.macSidebar(size: 12, scale: textScale))
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 8) {
                Text(detail.pull.headRef)
                Image(systemName: "arrow.right")
                Text(detail.pull.baseRef)
                Spacer()
                Text(detail.pull.diffSummary)
                Text("\(detail.pull.changedFiles) files")
            }
            .font(.macSidebar(size: 11, scale: textScale))
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .accessibilityIdentifier("mac-pr-detail-branch-summary")
        }
    }
}

private struct MacDetailSection<Content: View>: View {
    let title: String
    let systemImage: String
    let content: Content

    init(title: String, systemImage: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.systemImage = systemImage
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: systemImage)
                .font(.headline)
            VStack(alignment: .leading, spacing: 6) {
                content
            }
        }
    }
}

private extension GitHubPull {
    var macNeedsReviewAttention: Bool {
        isOpen && (checksStatus == "failure" || checksStatus == "pending")
    }
}

private enum MacPullRepoColors {
    private static let palette: [Color] = [
        Color(red: 248 / 255, green: 81 / 255, blue: 73 / 255),
        Color(red: 88 / 255, green: 166 / 255, blue: 255 / 255),
        Color(red: 63 / 255, green: 185 / 255, blue: 80 / 255),
        Color(red: 188 / 255, green: 140 / 255, blue: 255 / 255),
        Color(red: 210 / 255, green: 153 / 255, blue: 34 / 255),
        Color(red: 57 / 255, green: 208 / 255, blue: 214 / 255),
        Color(red: 232 / 255, green: 113 / 255, blue: 37 / 255),
    ]

    static func color(for index: Int) -> Color {
        palette[index % palette.count]
    }
}
