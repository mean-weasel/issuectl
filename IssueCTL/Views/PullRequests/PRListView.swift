import SwiftUI

struct PRListView: View {
    @Environment(APIClient.self) private var api
    @State private var repos: [Repo] = []
    @State private var pullsByRepo: [String: [GitHubPull]] = [:]
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var filter: PRFilter = .open

    enum PRFilter: String, CaseIterable {
        case open = "Open"
        case closed = "Closed"
        case all = "All"
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && pullsByRepo.isEmpty {
                    ProgressView("Loading pull requests...")
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
                        description: Text(filter == .open ? "No open pull requests." : "No pull requests found.")
                    )
                } else {
                    List {
                        ForEach(reposWithPulls, id: \.id) { repo in
                            Section(repo.fullName) {
                                ForEach(pullsForRepo(repo)) { pull in
                                    NavigationLink(value: PRDestination(owner: repo.owner, repo: repo.name, number: pull.number)) {
                                        PRRowView(pull: pull)
                                    }
                                }
                            }
                        }
                    }
                    .refreshable { await loadAll(refresh: true) }
                }
            }
            .navigationTitle("Pull Requests")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Picker("Filter", selection: $filter) {
                        ForEach(PRFilter.allCases, id: \.self) { f in
                            Text(f.rawValue).tag(f)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 200)
                }
            }
            .navigationDestination(for: PRDestination.self) { dest in
                PRDetailView(owner: dest.owner, repo: dest.repo, number: dest.number)
            }
            .task { await loadAll() }
        }
    }

    private var filteredPulls: [GitHubPull] {
        pullsByRepo.values.flatMap { pulls in
            pulls.filter { pull in
                switch filter {
                case .open: pull.isOpen
                case .closed: !pull.isOpen
                case .all: true
                }
            }
        }
    }

    private var reposWithPulls: [Repo] {
        repos.filter { repo in
            !pullsForRepo(repo).isEmpty
        }
    }

    private func pullsForRepo(_ repo: Repo) -> [GitHubPull] {
        let pulls = pullsByRepo[repo.fullName] ?? []
        return pulls.filter { pull in
            switch filter {
            case .open: pull.isOpen
            case .closed: !pull.isOpen
            case .all: true
            }
        }
    }

    private func loadAll(refresh: Bool = false) async {
        isLoading = true
        errorMessage = nil
        do {
            repos = try await api.repos()
            await withTaskGroup(of: (String, [GitHubPull])?.self) { group in
                for repo in repos {
                    group.addTask {
                        do {
                            let response = try await api.pulls(owner: repo.owner, repo: repo.name, refresh: refresh)
                            return (repo.fullName, response.pulls)
                        } catch {
                            return nil
                        }
                    }
                }
                for await result in group {
                    if let (key, pulls) = result {
                        pullsByRepo[key] = pulls
                    }
                }
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
