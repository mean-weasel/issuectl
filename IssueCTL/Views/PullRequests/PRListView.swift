import SwiftUI

struct PRListView: View {
    @Environment(APIClient.self) private var api
    @State private var repos: [Repo] = []
    @State private var pullsByRepo: [String: [GitHubPull]] = [:]
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var section: PRSection = .open
    @State private var selectedRepoIds: Set<Int> = []
    @State private var sortOrder: SortOrder = .updated

    // Swipe state
    @State private var showMergeConfirm = false
    @State private var swipeTarget: (owner: String, repo: String, number: Int)?
    @State private var actionError: String?
    @State private var errorDismissTask: Task<Void, Never>?

    private var allPulls: [GitHubPull] {
        pullsByRepo.values.flatMap { $0 }
    }

    // Pulls filtered by selected repos (before section/sort filtering)
    private var repoFilteredPulls: [GitHubPull] {
        if selectedRepoIds.isEmpty {
            return allPulls
        }
        let selectedRepoNames = Set(repos.filter { selectedRepoIds.contains($0.id) }.map(\.fullName))
        return pullsByRepo
            .filter { selectedRepoNames.contains($0.key) }
            .values.flatMap { $0 }
    }

    private var filteredPulls: [GitHubPull] {
        var items = repoFilteredPulls

        switch section {
        case .open: items = items.filter { $0.isOpen }
        case .closed: items = items.filter { !$0.isOpen }
        }

        switch sortOrder {
        case .updated: items.sort { $0.updatedAt > $1.updatedAt }
        case .created: items.sort { $0.createdAt > $1.createdAt }
        // PRs have no priority equivalent — fall back to updated sort
        case .priority: items.sort { $0.updatedAt > $1.updatedAt }
        }

        return items
    }

    private var sectionCounts: [PRSection: Int] {
        let items = repoFilteredPulls
        return [
            .open: items.filter(\.isOpen).count,
            .closed: items.filter { !$0.isOpen }.count,
        ]
    }

    private func repoIndex(for pull: GitHubPull) -> Int? {
        for (repoFullName, pulls) in pullsByRepo {
            if pulls.contains(where: { $0.htmlUrl == pull.htmlUrl }) {
                return repos.firstIndex(where: { $0.fullName == repoFullName })
            }
        }
        return nil
    }

    private func repoFor(pull: GitHubPull) -> Repo? {
        for (repoFullName, pulls) in pullsByRepo {
            if pulls.contains(where: { $0.htmlUrl == pull.htmlUrl }) {
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
                    if isLoading && pullsByRepo.isEmpty {
                        ProgressView("Loading pull requests...")
                            .frame(maxHeight: .infinity)
                    } else if let errorMessage {
                        ContentUnavailableView {
                            Label("Error", systemImage: "exclamationmark.triangle")
                        } description: {
                            Text(errorMessage)
                        } actions: {
                            Button("Retry") { Task { await loadAll() } }
                        }
                    } else if filteredPulls.isEmpty {
                        ContentUnavailableView(
                            "No Pull Requests",
                            systemImage: "arrow.triangle.merge",
                            description: Text("No \(section.rawValue) pull requests.")
                        )
                    } else {
                        pullsList
                    }
                }
            }
            .navigationTitle("Pull Requests")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Sort", selection: $sortOrder) {
                            Label("Updated", systemImage: "clock").tag(SortOrder.updated)
                            Label("Created", systemImage: "calendar").tag(SortOrder.created)
                        }
                    } label: {
                        Image(systemName: "arrow.up.arrow.down")
                    }
                }
            }
            .navigationDestination(for: PRDestination.self) { dest in
                PRDetailView(owner: dest.owner, repo: dest.repo, number: dest.number)
            }
            .confirmationDialog("Merge Pull Request", isPresented: $showMergeConfirm, titleVisibility: .visible) {
                Button("Squash & Merge") {
                    if let target = swipeTarget {
                        Task { await mergePull(owner: target.owner, repo: target.repo, number: target.number, strategy: "squash") }
                    }
                }
                Button("Merge Commit") {
                    if let target = swipeTarget {
                        Task { await mergePull(owner: target.owner, repo: target.repo, number: target.number, strategy: "merge") }
                    }
                }
                Button("Rebase") {
                    if let target = swipeTarget {
                        Task { await mergePull(owner: target.owner, repo: target.repo, number: target.number, strategy: "rebase") }
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

    // MARK: - List

    @ViewBuilder
    private var pullsList: some View {
        List {
            if let actionError {
                Label(actionError, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .font(.subheadline)
            }
            ForEach(filteredPulls, id: \.htmlUrl) { pull in
                let color = repoIndex(for: pull).map { RepoColors.color(for: $0) } ?? .secondary
                let repo = repoFor(pull: pull)

                if let repo {
                    NavigationLink(value: PRDestination(
                        owner: repo.owner,
                        repo: repo.name,
                        number: pull.number
                    )) {
                        PRRowView(pull: pull, repoColor: color)
                    }
                    .swipeActions(edge: .leading) {
                        if pull.isOpen {
                            Button {
                                swipeTarget = (repo.owner, repo.name, pull.number)
                                showMergeConfirm = true
                            } label: {
                                Label("Merge", systemImage: "arrow.triangle.merge")
                            }
                            .tint(.green)
                        }
                    }
                }
            }
        }
        .refreshable { await loadAll(refresh: true) }
    }

    // MARK: - Actions

    private func mergePull(owner: String, repo: String, number: Int, strategy: String) async {
        actionError = nil
        do {
            let body = MergeRequestBody(mergeMethod: strategy)
            let response = try await api.mergePull(owner: owner, repo: repo, number: number, body: body)
            if response.success {
                await loadAll(refresh: true)
            } else {
                actionError = response.error ?? "Failed to merge"
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
            var failedRepos: [String] = []
            await withTaskGroup(of: (String, String, [GitHubPull]?).self) { group in
                for repo in repos {
                    group.addTask {
                        do {
                            let response = try await api.pulls(owner: repo.owner, repo: repo.name, refresh: refresh)
                            return (repo.fullName, repo.name, response.pulls)
                        } catch {
                            return (repo.fullName, repo.name, nil)
                        }
                    }
                }
                for await (fullName, name, pulls) in group {
                    if let pulls {
                        pullsByRepo[fullName] = pulls
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

struct PRDestination: Hashable {
    let owner: String
    let repo: String
    let number: Int
}
