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
    @State private var showCreateSheet = false

    // Swipe action state
    @State private var showCloseConfirm = false
    @State private var showReopenConfirm = false
    @State private var swipeTarget: (owner: String, repo: String, number: Int)?
    @State private var showLaunchSheet = false
    @State private var launchTarget: (owner: String, repo: String, number: Int, title: String)?

    // Draft swipe state
    @State private var showDeleteDraftConfirm = false
    @State private var deleteDraftTarget: String?

    @State private var actionError: String?
    @State private var errorDismissTask: Task<Void, Never>?

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

    // Issues filtered by selected repos (before section/sort filtering)
    private var repoFilteredIssues: [GitHubIssue] {
        if selectedRepoIds.isEmpty {
            return allIssues
        }
        let selectedRepoNames = Set(repos.filter { selectedRepoIds.contains($0.id) }.map(\.fullName))
        return issuesByRepo
            .filter { selectedRepoNames.contains($0.key) }
            .values.flatMap { $0 }
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
        case .closed: items = items.filter { !$0.isOpen }
        }

        switch sortOrder {
        case .updated: items.sort { $0.updatedAt > $1.updatedAt }
        case .created: items.sort { $0.createdAt > $1.createdAt }
        // Comment count as rough engagement proxy — GitHub issues have no native priority field
        case .priority: items.sort { $0.commentCount > $1.commentCount }
        }

        return items
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
        let closed = items.filter { !$0.isOpen }
        return [
            .drafts: drafts.count,
            .open: open.count,
            .running: running.count,
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
        NavigationStack {
            VStack(spacing: 0) {
                SectionTabs(selected: $section, counts: sectionCounts)
                    .padding(.vertical, 8)

                RepoFilterChips(repos: repos, selectedRepoIds: $selectedRepoIds)
                    .padding(.bottom, 8)

                Divider()

                Group {
                    if isLoading && issuesByRepo.isEmpty && drafts.isEmpty {
                        ProgressView("Loading issues...")
                            .frame(maxHeight: .infinity)
                    } else if let errorMessage {
                        ContentUnavailableView {
                            Label("Error", systemImage: "exclamationmark.triangle")
                        } description: {
                            Text(errorMessage)
                        } actions: {
                            Button("Retry") { Task { await loadAll() } }
                        }
                    } else if section == .drafts {
                        draftsList
                    } else if filteredIssues.isEmpty {
                        ContentUnavailableView(
                            "No Issues",
                            systemImage: "checkmark.circle",
                            description: Text("No \(section.rawValue) issues.")
                        )
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
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCreateSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .navigationDestination(for: IssueDestination.self) { dest in
                IssueDetailView(owner: dest.owner, repo: dest.repo, number: dest.number)
            }
            .sheet(isPresented: $showCreateSheet) {
                QuickCreateSheet(repos: repos, onSuccess: { Task { await loadAll(refresh: true) } })
            }
            .sheet(isPresented: $showLaunchSheet) {
                if let target = launchTarget {
                    LaunchView(
                        owner: target.owner,
                        repo: target.repo,
                        issueNumber: target.number,
                        issueTitle: target.title,
                        comments: [],
                        referencedFiles: []
                    )
                }
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
        }
    }

    // MARK: - Lists

    @ViewBuilder
    private var issuesList: some View {
        List {
            if let actionError {
                Label(actionError, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .font(.subheadline)
            }
            ForEach(filteredIssues, id: \.htmlUrl) { issue in
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
                    .swipeActions(edge: .leading) {
                        if issue.isOpen {
                            Button {
                                launchTarget = (repo.owner, repo.name, issue.number, issue.title)
                                showLaunchSheet = true
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
        }
        .refreshable { await loadAll(refresh: true) }
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
                    VStack(alignment: .leading, spacing: 4) {
                        Text(draft.title)
                            .font(.body)
                        if let priority = draft.priority, priority != "normal" {
                            Text(priority.capitalized)
                                .font(.caption2)
                                .foregroundStyle(priority == "high" ? .red : .secondary)
                        }
                    }
                    .padding(.vertical, 2)
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
            .refreshable { await loadAll(refresh: true) }
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
        do {
            repos = try await api.repos()

            // Drafts and deployments are supplementary — fetch independently so a failure
            // doesn't block the primary issue list.
            async let draftsFetch: DraftsResponse? = {
                do { return try await api.listDrafts() }
                catch { return nil }
            }()
            async let deploymentsFetch: ActiveDeploymentsResponse? = {
                do { return try await api.activeDeployments() }
                catch { return nil }
            }()

            drafts = await draftsFetch?.drafts ?? drafts
            activeDeployments = await deploymentsFetch?.deployments ?? activeDeployments

            var failedRepos: [String] = []
            await withTaskGroup(of: (String, String, [GitHubIssue]?).self) { group in
                for repo in repos {
                    group.addTask {
                        do {
                            let response = try await api.issues(owner: repo.owner, repo: repo.name, refresh: refresh)
                            return (repo.fullName, repo.name, response.issues)
                        } catch {
                            return (repo.fullName, repo.name, nil)
                        }
                    }
                }
                for await (fullName, name, issues) in group {
                    if let issues {
                        issuesByRepo[fullName] = issues
                    } else {
                        failedRepos.append(name)
                    }
                }
            }
            if !failedRepos.isEmpty {
                actionError = "Failed to load: \(failedRepos.joined(separator: ", "))"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

struct IssueDestination: Hashable {
    let owner: String
    let repo: String
    let number: Int
}
