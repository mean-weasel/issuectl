import SwiftUI

struct SettingsView: View {
    @Environment(APIClient.self) private var api
    @State private var showDisconnectConfirm = false
    @State private var showAddRepo = false
    @State private var repos: [Repo] = []
    @State private var serverHealth: ServerHealth?
    @State private var isLoadingRepos = false
    @State private var isLoadingHealth = false
    @State private var reposError: String?
    @State private var healthError: String?
    @State private var removeError: String?
    @State private var refreshError: String?
    @State private var editingRepo: Repo?

    var body: some View {
        NavigationStack {
            Form {
                serverInfoSection
                reposSection
                disconnectSection
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showAddRepo = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add repository")
                }
            }
            .sheet(isPresented: $showAddRepo) {
                AddRepoSheet { newRepo in
                    repos.insert(newRepo, at: 0)
                }
            }
            .sheet(item: $editingRepo) { repo in
                EditRepoSheet(repo: repo) { updated in
                    if let idx = repos.firstIndex(where: { $0.id == updated.id }) {
                        repos[idx] = updated
                    }
                }
            }
            .confirmationDialog(
                "Disconnect from server?",
                isPresented: $showDisconnectConfirm,
                titleVisibility: .visible
            ) {
                Button("Disconnect", role: .destructive) {
                    api.disconnect()
                }
            }
            .alert("Remove Failed", isPresented: .init(
                get: { removeError != nil },
                set: { if !$0 { removeError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(removeError ?? "")
            }
            .alert("Refresh Failed", isPresented: .init(
                get: { refreshError != nil },
                set: { if !$0 { refreshError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(refreshError ?? "")
            }
            .task {
                await loadData()
            }
            .refreshable {
                await loadData()
            }
        }
    }

    // MARK: - Server Info Section

    private var serverInfoSection: some View {
        Section("Server") {
            LabeledContent("URL", value: api.serverURL)

            LabeledContent("Status") {
                if isLoadingHealth {
                    ProgressView()
                } else if healthError != nil {
                    Label("Error", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                } else {
                    Label("Connected", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
            }

            if let health = serverHealth {
                LabeledContent("Version", value: health.version)
            } else if let error = healthError {
                LabeledContent("Error") {
                    Text(error)
                        .foregroundStyle(.secondary)
                        .font(.caption)
                }
            }
        }
    }

    // MARK: - Repos Section

    private var reposSection: some View {
        Section {
            if isLoadingRepos && repos.isEmpty {
                HStack {
                    Spacer()
                    ProgressView("Loading repositories...")
                    Spacer()
                }
            } else if let error = reposError, repos.isEmpty {
                Label(error, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.secondary)
            } else if repos.isEmpty {
                ContentUnavailableView {
                    Label("No Repositories", systemImage: "folder")
                } description: {
                    Text("Tap + to track a repository.")
                }
            } else {
                ForEach(repos) { repo in
                    Button {
                        editingRepo = repo
                    } label: {
                        RepoRow(repo: repo)
                    }
                    .tint(.primary)
                }
                .onDelete(perform: deleteRepos)
            }
        } header: {
            HStack {
                Text("Repositories")
                Spacer()
                Text("\(repos.count)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Disconnect Section

    private var disconnectSection: some View {
        Section {
            Button("Disconnect", role: .destructive) {
                showDisconnectConfirm = true
            }
        }
    }

    // MARK: - Data Loading

    private func loadData() async {
        async let healthTask: () = loadHealth()
        async let reposTask: () = loadRepos()
        _ = await (healthTask, reposTask)
    }

    private func loadHealth() async {
        isLoadingHealth = true
        defer { isLoadingHealth = false }
        do {
            serverHealth = try await api.health()
            healthError = nil
        } catch {
            healthError = error.localizedDescription
            serverHealth = nil
        }
    }

    private func loadRepos() async {
        isLoadingRepos = true
        defer { isLoadingRepos = false }
        do {
            repos = try await api.repos()
            reposError = nil
        } catch {
            if repos.isEmpty {
                reposError = error.localizedDescription
            } else {
                refreshError = error.localizedDescription
            }
        }
    }

    // MARK: - Repo Deletion

    private func deleteRepos(at offsets: IndexSet) {
        let reposToDelete = offsets.map { repos[$0] }
        // Optimistic removal
        repos.remove(atOffsets: offsets)

        Task {
            for repo in reposToDelete {
                do {
                    try await api.removeRepo(owner: repo.owner, name: repo.name)
                } catch {
                    // Restore on failure
                    removeError = "Failed to remove \(repo.fullName): \(error.localizedDescription)"
                    await loadRepos()
                    return
                }
            }
        }
    }
}

// MARK: - Repo Row

private struct RepoRow: View {
    let repo: Repo

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(repo.fullName)
                    .font(.body)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let localPath = repo.localPath {
                Text(localPath)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let branchPattern = repo.branchPattern {
                Text("Branch: \(branchPattern)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
