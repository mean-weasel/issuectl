import SwiftUI

struct RepoListView: View {
    @Environment(APIClient.self) private var api
    @State private var repos: [Repo] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && repos.isEmpty {
                    ProgressView("Loading repos...")
                } else if let errorMessage {
                    ContentUnavailableView {
                        Label("Error", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(errorMessage)
                    } actions: {
                        Button("Retry") { Task { await loadRepos() } }
                    }
                } else if repos.isEmpty {
                    ContentUnavailableView(
                        "No Repos",
                        systemImage: "folder",
                        description: Text("Add repos with `issuectl repo add` on your Mac.")
                    )
                } else {
                    List(repos) { repo in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(repo.fullName)
                                .font(.headline)
                            if let path = repo.localPath {
                                Text(path)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .refreshable { await loadRepos() }
                }
            }
            .navigationTitle("Repos")
            .task { await loadRepos() }
        }
    }

    private func loadRepos() async {
        isLoading = true
        errorMessage = nil
        do {
            repos = try await api.repos()
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
