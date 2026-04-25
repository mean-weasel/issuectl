import SwiftUI

struct IssueListView: View {
    @Environment(APIClient.self) private var api
    @State private var repos: [Repo] = []
    @State private var issuesByRepo: [String: [GitHubIssue]] = [:]
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var filter: IssueFilter = .open

    enum IssueFilter: String, CaseIterable {
        case open = "Open"
        case closed = "Closed"
        case all = "All"
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && issuesByRepo.isEmpty {
                    ProgressView("Loading issues...")
                } else if let errorMessage {
                    ContentUnavailableView {
                        Label("Error", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(errorMessage)
                    } actions: {
                        Button("Retry") { Task { await loadAll() } }
                    }
                } else if filteredIssues.isEmpty {
                    ContentUnavailableView(
                        "No Issues",
                        systemImage: "checkmark.circle",
                        description: Text(filter == .open ? "No open issues." : "No issues found.")
                    )
                } else {
                    List {
                        ForEach(reposWithIssues, id: \.id) { repo in
                            Section(repo.fullName) {
                                ForEach(issuesForRepo(repo)) { issue in
                                    NavigationLink(value: IssueDestination(owner: repo.owner, repo: repo.name, number: issue.number)) {
                                        IssueRowView(issue: issue)
                                    }
                                }
                            }
                        }
                    }
                    .refreshable { await loadAll(refresh: true) }
                }
            }
            .navigationTitle("Issues")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Picker("Filter", selection: $filter) {
                        ForEach(IssueFilter.allCases, id: \.self) { f in
                            Text(f.rawValue).tag(f)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 200)
                }
            }
            .navigationDestination(for: IssueDestination.self) { dest in
                IssueDetailView(owner: dest.owner, repo: dest.repo, number: dest.number)
            }
            .task { await loadAll() }
        }
    }

    private var filteredIssues: [GitHubIssue] {
        issuesByRepo.values.flatMap { issues in
            issues.filter { issue in
                switch filter {
                case .open: issue.isOpen
                case .closed: !issue.isOpen
                case .all: true
                }
            }
        }
    }

    private var reposWithIssues: [Repo] {
        repos.filter { repo in
            !issuesForRepo(repo).isEmpty
        }
    }

    private func issuesForRepo(_ repo: Repo) -> [GitHubIssue] {
        let issues = issuesByRepo[repo.fullName] ?? []
        return issues.filter { issue in
            switch filter {
            case .open: issue.isOpen
            case .closed: !issue.isOpen
            case .all: true
            }
        }
    }

    private func loadAll(refresh: Bool = false) async {
        isLoading = true
        errorMessage = nil
        do {
            repos = try await api.repos()
            await withTaskGroup(of: (String, [GitHubIssue])?.self) { group in
                for repo in repos {
                    group.addTask {
                        do {
                            let response = try await api.issues(owner: repo.owner, repo: repo.name, refresh: refresh)
                            return (repo.fullName, response.issues)
                        } catch {
                            return nil
                        }
                    }
                }
                for await result in group {
                    if let (key, issues) = result {
                        issuesByRepo[key] = issues
                    }
                }
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
