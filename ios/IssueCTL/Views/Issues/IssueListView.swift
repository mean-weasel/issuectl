import SwiftUI

struct IssueListView: View {
    @Environment(APIClient.self) private var api
    @State private var repos: [Repo] = []
    @State private var issuesByRepo: [String: [GitHubIssue]] = [:]
    @State private var drafts: [Draft] = []
    @State private var activeDeployments: [ActiveDeployment] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var section: IssueSection = .open
    @State private var selectedRepoIds: Set<Int> = []
    @State private var sortOrder: SortOrder = .updated
    @State private var mineOnly = false
    @SceneStorage("issues.section") private var storedSection = IssueSection.open.rawValue
    @SceneStorage("issues.sortOrder") private var storedSortOrder = SortOrder.updated.rawValue
    @SceneStorage("issues.mineOnly") private var storedMineOnly = false
    @State private var showCreateSheet = false
    @State private var showParseSheet = false
    @State private var currentUserLogin: String?
    @State private var userFetchFailed = false
    @State private var navigationPath = NavigationPath()

    // Swipe action state
    @State private var showCloseConfirm = false
    @State private var showReopenConfirm = false
    @State private var swipeTarget: (owner: String, repo: String, number: Int)?
    @State private var launchTarget: LaunchTarget?

    // Draft swipe state
    @State private var showDeleteDraftConfirm = false
    @State private var deleteDraftTarget: String?

    @State private var actionError: String?
    @State private var errorDismissTask: Task<Void, Never>?

    // Priority data keyed by "owner/repo#number"
    @State private var priorities: [String: Priority] = [:]
    @State private var isLoadingPriorities = false

    @State private var oldestCachedAt: Date?
    private let pageSize = 15
    @State private var displayLimit = 15
    @State private var lastRefreshDate: Date?
    private let refreshCooldown: TimeInterval = 10

    private var allIssues: [GitHubIssue] {
        issuesByRepo.values.flatMap { $0 }
    }

    // Maps repo full name to set of running issue numbers for that repo.
    // Keyed by repo to avoid cross-repo collisions (issue #5 in repo A vs repo B).
    private var runningIssuesByRepo: [String: Set<Int>] {
        var map: [String: Set<Int>] = [:]
        for deployment in activeDeployments {
            map[deployment.repoFullName, default: []].insert(deployment.issueNumber)
        }
        return map
    }

    private func isRunning(_ issue: GitHubIssue, in repoFullName: String) -> Bool {
        runningIssuesByRepo[repoFullName]?.contains(issue.number) ?? false
    }

    // Issues filtered by selected repos and "mine" toggle (before section/sort filtering)
    private var repoFilteredIssues: [GitHubIssue] {
        var items: [GitHubIssue]
        if selectedRepoIds.isEmpty {
            items = allIssues
        } else {
            let selectedRepoNames = Set(repos.filter { selectedRepoIds.contains($0.id) }.map(\.fullName))
            items = issuesByRepo
                .filter { selectedRepoNames.contains($0.key) }
                .values.flatMap { $0 }
        }
        if mineOnly, let login = currentUserLogin {
            items = items.filter { $0.user?.login == login }
        }
        return items
    }

    private var filteredIssues: [GitHubIssue] {
        var items = repoFilteredIssues

        switch section {
        case .drafts: return []
        case .open: items = items.filter { issue in
            guard let repo = repoFor(issue: issue) else { return issue.isOpen }
            return issue.isOpen && !isRunning(issue, in: repo.fullName)
        }
        case .running: items = items.filter { issue in
            guard let repo = repoFor(issue: issue) else { return false }
            return issue.isOpen && isRunning(issue, in: repo.fullName)
        }
        case .unassigned: items = items.filter { issue in
            issue.isOpen && (issue.assignees ?? []).isEmpty
        }
        case .closed: items = items.filter { !$0.isOpen }
        }

        switch sortOrder {
        case .updated: items.sort { $0.updatedAt > $1.updatedAt }
        case .created: items.sort { $0.createdAt > $1.createdAt }
        case .priority: items.sort { prioritySortIndex(for: $0) < prioritySortIndex(for: $1) }
        }

        return items
    }

    /// Returns a sort index for priority sorting (high=0, normal=1, low=2).
    private func prioritySortIndex(for issue: GitHubIssue) -> Int {
        guard let repo = repoFor(issue: issue) else { return Priority.normal.sortIndex }
        let key = "\(repo.owner)/\(repo.name)#\(issue.number)"
        return (priorities[key] ?? .normal).sortIndex
    }

    private var sectionCounts: [IssueSection: Int] {
        let items = repoFilteredIssues
        let open = items.filter { issue in
            guard let repo = repoFor(issue: issue) else { return issue.isOpen }
            return issue.isOpen && !isRunning(issue, in: repo.fullName)
        }
        let running = items.filter { issue in
            guard let repo = repoFor(issue: issue) else { return false }
            return issue.isOpen && isRunning(issue, in: repo.fullName)
        }
        let unassigned = items.filter { issue in
            issue.isOpen && (issue.assignees ?? []).isEmpty
        }
        let closed = items.filter { !$0.isOpen }
        return [
            .drafts: drafts.count,
            .open: open.count,
            .running: running.count,
            .unassigned: unassigned.count,
            .closed: closed.count,
        ]
    }

    private func repoIndex(for issue: GitHubIssue) -> Int? {
        for (repoFullName, issues) in issuesByRepo {
            if issues.contains(where: { $0.htmlUrl == issue.htmlUrl }) {
                return repos.firstIndex(where: { $0.fullName == repoFullName })
            }
        }
        return nil
    }

    private func repoFor(issue: GitHubIssue) -> Repo? {
        for (repoFullName, issues) in issuesByRepo {
            if issues.contains(where: { $0.htmlUrl == issue.htmlUrl }) {
                return repos.first(where: { $0.fullName == repoFullName })
            }
        }
        return nil
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            VStack(spacing: 0) {
                SectionTabs(selected: $section, counts: sectionCounts)
                    .padding(.vertical, 8)

                HStack(spacing: 0) {
                    RepoFilterChips(repos: repos, selectedRepoIds: $selectedRepoIds)
                    MineFilterChip(isOn: $mineOnly, isAvailable: currentUserLogin != nil, isDisabled: userFetchFailed)
                        .padding(.trailing, 16)
                }
                .padding(.bottom, 8)

                Divider()

                if let oldestCachedAt {
                    CacheAgeLabel(date: oldestCachedAt)
                        .padding(.horizontal, 16)
                        .padding(.top, 4)
                }

                Group {
                    if isLoading && issuesByRepo.isEmpty && drafts.isEmpty {
                        ProgressView("Loading issues...")
                            .frame(maxHeight: .infinity)
                    } else if let errorMessage {
                        ScrollView {
                            ContentUnavailableView {
                                Label("Error", systemImage: "exclamationmark.triangle")
                            } description: {
                                Text(errorMessage)
                            } actions: {
                                Button("Retry") { Task { await loadAll() } }
                            }
                            .frame(maxHeight: .infinity)
                        }
                        .refreshable { await refreshWithCooldown() }
                    } else if section == .drafts {
                        draftsList
                    } else if filteredIssues.isEmpty {
                        ScrollView {
                            ContentUnavailableView(
                                "No Issues",
                                systemImage: "checkmark.circle",
                                description: Text("No \(section.rawValue) issues.")
                            )
                            .frame(maxHeight: .infinity)
                        }
                        .refreshable { await refreshWithCooldown() }
                    } else {
                        issuesList
                    }
                }
            }
            .navigationTitle("Issues")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Sort", selection: $sortOrder) {
                            Label("Updated", systemImage: "clock").tag(SortOrder.updated)
                            Label("Created", systemImage: "calendar").tag(SortOrder.created)
                            Label("Priority", systemImage: "arrow.up.arrow.down").tag(SortOrder.priority)
                        }
                    } label: {
                        Image(systemName: "arrow.up.arrow.down")
                    }
                    .accessibilityIdentifier("sort-menu")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            showCreateSheet = true
                        } label: {
                            Label("Quick Create", systemImage: "plus")
                        }
                        .accessibilityIdentifier("quick-create-button")
                        Button {
                            showParseSheet = true
                        } label: {
                            Label("Parse with AI", systemImage: "text.viewfinder")
                        }
                        .accessibilityIdentifier("parse-ai-button")
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityIdentifier("create-menu")
                }
            }
            .navigationDestination(for: IssueDestination.self) { dest in
                IssueDetailView(owner: dest.owner, repo: dest.repo, number: dest.number)
            }
            .navigationDestination(for: DraftDestination.self) { dest in
                DraftDetailView(draft: dest.draft, onSaved: { Task { await loadAll(refresh: true) } })
            }
            .sheet(isPresented: $showCreateSheet) {
                QuickCreateSheet(repos: repos, onSuccess: { Task { await loadAll(refresh: true) } })
            }
            .sheet(isPresented: $showParseSheet) {
                ParseView()
            }
            .sheet(item: $launchTarget) { target in
                LaunchView(
                    owner: target.owner,
                    repo: target.repo,
                    issueNumber: target.number,
                    issueTitle: target.title,
                    comments: [],
                    referencedFiles: []
                )
            }
            .confirmationDialog("Close Issue", isPresented: $showCloseConfirm, titleVisibility: .visible) {
                Button("Close", role: .destructive) {
                    if let target = swipeTarget {
                        Task { await updateIssueState(owner: target.owner, repo: target.repo, number: target.number, state: "closed") }
                    }
                }
            }
            .confirmationDialog("Reopen Issue", isPresented: $showReopenConfirm, titleVisibility: .visible) {
                Button("Reopen") {
                    if let target = swipeTarget {
                        Task { await updateIssueState(owner: target.owner, repo: target.repo, number: target.number, state: "open") }
                    }
                }
            }
            .confirmationDialog("Delete Draft", isPresented: $showDeleteDraftConfirm, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let draftId = deleteDraftTarget {
                        Task { await deleteDraft(id: draftId) }
                    }
                }
            }
            .onChange(of: actionError) { _, newValue in
                errorDismissTask?.cancel()
                if newValue != nil {
                    errorDismissTask = Task {
                        try? await Task.sleep(for: .seconds(5))
                        if !Task.isCancelled {
                            actionError = nil
                        }
                    }
                }
            }
            .task { await loadAll() }
            .onAppear {
                if let s = IssueSection(rawValue: storedSection) { section = s }
                if let s = SortOrder(rawValue: storedSortOrder) { sortOrder = s }
                mineOnly = storedMineOnly
            }
            .onChange(of: section) { _, new in
                displayLimit = pageSize
                storedSection = new.rawValue
            }
            .onChange(of: selectedRepoIds) { _, _ in displayLimit = pageSize }
            .onChange(of: sortOrder) { _, new in
                displayLimit = pageSize
                storedSortOrder = new.rawValue
            }
            .onChange(of: mineOnly) { _, new in
                displayLimit = pageSize
                storedMineOnly = new
            }
            .interactivePopDisabled(isAtRoot: navigationPath.isEmpty)
        }
    }

    // MARK: - Lists

    @ViewBuilder
    private var issuesList: some View {
        let allFiltered = filteredIssues
        let visibleIssues = Array(allFiltered.prefix(displayLimit))
        List {
            if let actionError {
                Label(actionError, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .font(.subheadline)
                    .lineLimit(3)
            }
            ForEach(visibleIssues, id: \.htmlUrl) { issue in
                let color = repoIndex(for: issue).map { RepoColors.color(for: $0) } ?? .secondary
                let repo = repoFor(issue: issue)
                let running = repo.map { isRunning(issue, in: $0.fullName) } ?? false

                if let repo {
                    NavigationLink(value: IssueDestination(
                        owner: repo.owner,
                        repo: repo.name,
                        number: issue.number
                    )) {
                        IssueRowView(issue: issue, repoColor: color, isRunning: running)
                    }
                    .accessibilityIdentifier("issue-row-\(issue.number)")
                    .swipeActions(edge: .leading, allowsFullSwipe: false) {
                        if issue.isOpen {
                            Button {
                                launchTarget = LaunchTarget(owner: repo.owner, repo: repo.name, number: issue.number, title: issue.title)
                            } label: {
                                Label("Launch", systemImage: "play.fill")
                            }
                            .tint(.green)
                        } else {
                            Button {
                                swipeTarget = (repo.owner, repo.name, issue.number)
                                showReopenConfirm = true
                            } label: {
                                Label("Reopen", systemImage: "arrow.uturn.backward.circle")
                            }
                            .tint(.green)
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        if issue.isOpen {
                            Button(role: .destructive) {
                                swipeTarget = (repo.owner, repo.name, issue.number)
                                showCloseConfirm = true
                            } label: {
                                Label("Close", systemImage: "xmark.circle")
                            }
                        }
                    }
                }
            }

            if allFiltered.count > displayLimit {
                Button {
                    displayLimit += pageSize
                } label: {
                    Text("Load More (\(allFiltered.count - displayLimit) remaining)")
                        .font(.subheadline)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .refreshable { await refreshWithCooldown() }
    }

    @ViewBuilder
    private var draftsList: some View {
        if drafts.isEmpty {
            ContentUnavailableView(
                "No Drafts",
                systemImage: "doc.text",
                description: Text("Tap + to create a draft.")
            )
        } else {
            List {
                ForEach(drafts) { draft in
                    NavigationLink(value: DraftDestination(draft: draft)) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(draft.title)
                                .font(.body)
                            if let body = draft.body, !body.isEmpty {
                                Text(body)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                            if let priority = draft.priority, priority != .normal {
                                Text(priority.rawValue.capitalized)
                                    .font(.caption2)
                                    .foregroundStyle(priority == .high ? .red : .secondary)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .accessibilityIdentifier("draft-row-\(draft.id)")
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            deleteDraftTarget = draft.id
                            showDeleteDraftConfirm = true
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
            .refreshable { await refreshWithCooldown() }
        }
    }

    // MARK: - Actions

    private func updateIssueState(owner: String, repo: String, number: Int, state: String) async {
        actionError = nil
        do {
            let body = IssueStateRequestBody(state: state, comment: nil)
            let response = try await api.updateIssueState(owner: owner, repo: repo, number: number, body: body)
            if response.success {
                await loadAll(refresh: true)
            } else {
                let verb = state == "closed" ? "close" : "reopen"
                actionError = response.error ?? "Failed to \(verb) issue"
            }
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func deleteDraft(id: String) async {
        actionError = nil
        do {
            let response = try await api.deleteDraft(id: id)
            if response.success {
                await loadAll(refresh: true)
            } else {
                actionError = response.error ?? "Failed to delete draft"
            }
        } catch {
            actionError = error.localizedDescription
        }
    }

    // MARK: - Loading

    private func loadAll(refresh: Bool = false) async {
        isLoading = true
        errorMessage = nil
        actionError = nil
        do {
            repos = try await api.repos()

            // Supplementary fetches — failures surface via actionError banner
            // but don't block the primary issue list.
            var failures: [String] = []

            async let draftsFetch: Result<DraftsResponse, Error> = {
                do { return .success(try await api.listDrafts()) }
                catch { return .failure(error) }
            }()
            async let deploymentsFetch: Result<ActiveDeploymentsResponse, Error> = {
                do { return .success(try await api.activeDeployments()) }
                catch { return .failure(error) }
            }()
            switch await draftsFetch {
            case .success(let result): drafts = result.drafts
            case .failure(let error): failures.append("drafts (\(error.localizedDescription))")
            }
            switch await deploymentsFetch {
            case .success(let result): activeDeployments = result.deployments
            case .failure(let error): failures.append("sessions (\(error.localizedDescription))")
            }

            do {
                let user = try await api.currentUser()
                currentUserLogin = user.login
                userFetchFailed = false
            } catch {
                userFetchFailed = true
                failures.append("user profile (\(error.localizedDescription))")
            }

            var cachedDates: [Date] = []
            let isoFormatter = ISO8601DateFormatter()

            await withTaskGroup(of: (String, String, [GitHubIssue]?, String?, Error?).self) { group in
                for repo in repos {
                    group.addTask {
                        do {
                            let response = try await api.issues(owner: repo.owner, repo: repo.name, refresh: refresh)
                            return (repo.fullName, repo.name, response.issues, response.cachedAt, nil)
                        } catch {
                            return (repo.fullName, repo.name, nil, nil, error)
                        }
                    }
                }
                for await (fullName, name, issues, cachedAt, error) in group {
                    if let issues {
                        issuesByRepo[fullName] = issues
                        if let cachedAt, let date = isoFormatter.date(from: cachedAt) {
                            cachedDates.append(date)
                        }
                    } else if let error {
                        failures.append("\(name) (\(error.localizedDescription))")
                    } else {
                        failures.append(name)
                    }
                }
            }
            oldestCachedAt = cachedDates.min()
            if !failures.isEmpty {
                actionError = "Failed to load: \(failures.joined(separator: ", "))"
            }

            // Fetch priorities for all displayed issues — failures are non-fatal
            let priorityFailures = await loadPriorities()
            if !priorityFailures.isEmpty && failures.isEmpty {
                // Only show priority failures if there aren't already more important errors
                actionError = "Failed to load: \(priorityFailures.joined(separator: ", "))"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func loadPriorities() async -> [String] {
        isLoadingPriorities = true
        var newPriorities: [String: Priority] = [:]
        var priorityErrors: [String] = []
        await withTaskGroup(of: ([(String, Priority)], String?).self) { group in
            let uniqueRepos = Set(repos.map { ($0.owner, $0.name) }.map { "\($0.0)/\($0.1)" })
            for repoFullName in uniqueRepos {
                guard let repo = repos.first(where: { $0.fullName == repoFullName }) else { continue }
                group.addTask {
                    do {
                        let items = try await api.listPriorities(owner: repo.owner, repo: repo.name)
                        return (items.map { ("\(repo.owner)/\(repo.name)#\($0.issueNumber)", $0.priority) }, nil)
                    } catch {
                        return ([], "\(repo.name) priorities (\(error.localizedDescription))")
                    }
                }
            }
            for await (pairs, errorMsg) in group {
                for (key, priority) in pairs {
                    newPriorities[key] = priority
                }
                if let errorMsg { priorityErrors.append(errorMsg) }
            }
        }
        priorities = newPriorities
        isLoadingPriorities = false
        return priorityErrors
    }

    private func refreshWithCooldown() async {
        guard shouldAllowRefresh(lastRefreshDate: lastRefreshDate, cooldown: refreshCooldown) else {
            return
        }
        lastRefreshDate = Date()
        await loadAll(refresh: true)
    }
}

struct IssueDestination: Hashable {
    let owner: String
    let repo: String
    let number: Int
}

struct LaunchTarget: Identifiable, Sendable {
    let owner: String
    let repo: String
    let number: Int
    let title: String

    var id: String { "\(owner)/\(repo)#\(number)" }
}

struct DraftDestination: Hashable {
    let draft: Draft

    static func == (lhs: DraftDestination, rhs: DraftDestination) -> Bool {
        lhs.draft.id == rhs.draft.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(draft.id)
    }
}
