import SwiftUI

struct SettingsView: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss
    @State private var showDisconnectConfirm = false
    @State private var showAddRepo = false
    @State private var repos: [Repo] = []
    @State private var serverHealth: ServerHealth?
    @State private var currentUsername: String?
    @State private var isLoadingRepos = false
    @State private var isLoadingHealth = false
    @State private var reposError: String?
    @State private var healthError: String?
    @State private var removeError: String?
    @State private var refreshError: String?
    @State private var editingRepo: Repo?
    @State private var navigationPath = NavigationPath()

    var body: some View {
        NavigationStack(path: $navigationPath) {
            Form {
                serverInfoSection
                reposSection
                managementSection
                disconnectSection
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .font(.subheadline.weight(.semibold))
                    .accessibilityIdentifier("settings-done-button")
                }
            }
            .navigationDestination(for: SettingsDestination.self) { dest in
                switch dest {
                case .advancedSettings:
                    AdvancedSettingsView()
                case .notifications:
                    NotificationSettingsView()
                case .worktrees:
                    WorktreeListView()
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
                    } else {
                        Task { await loadRepos() }
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
            .interactivePopDisabled(isAtRoot: navigationPath.isEmpty)
        }
    }

    // MARK: - Server Info Section

    private var serverInfoSection: some View {
        Section {
            SettingsStatusCard(
                serverURL: api.serverURL,
                username: currentUsername,
                repoCount: repos.count,
                serverVersion: serverHealth?.version,
                appVersion: AppVersion.display,
                healthError: healthError,
                isLoading: isLoadingHealth
            ) {
                Task { await loadData() }
            }
        }
        .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
        .listRowBackground(Color.clear)
    }

    // MARK: - Repos Section

    private var reposSection: some View {
        Section {
            Button {
                showAddRepo = true
            } label: {
                Label("Add Repository", systemImage: "plus.circle.fill")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .accessibilityIdentifier("settings-add-repository-button")

            if isLoadingRepos && repos.isEmpty {
                HStack {
                    Spacer()
                    ProgressView("Loading repositories...")
                    Spacer()
                }
            } else if let error = reposError, repos.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.secondary)
                    Button("Retry") {
                        Task { await loadRepos() }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            } else if repos.isEmpty {
                ContentUnavailableView {
                    Label("No Repositories", systemImage: "folder")
                } description: {
                    Text("Add a repo to populate Today, Issues, and PRs.")
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

    // MARK: - Management Section

    private var managementSection: some View {
        Section("Management") {
            NavigationLink(value: SettingsDestination.advancedSettings) {
                Label("Agent Harness & Defaults", systemImage: "terminal")
            }
            NavigationLink(value: SettingsDestination.notifications) {
                Label("Notifications", systemImage: "bell.badge")
            }
            .accessibilityIdentifier("settings-notifications-link")
            NavigationLink(value: SettingsDestination.worktrees) {
                Label("Worktrees", systemImage: "arrow.triangle.branch")
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
        async let userTask: () = loadUser()
        _ = await (healthTask, reposTask, userTask)
    }

    private func loadUser() async {
        do {
            let user = try await api.currentUser()
            currentUsername = user.login
        } catch {
            // Non-fatal — just don't show the username
        }
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

enum SettingsDestination: Hashable {
    case advancedSettings
    case notifications
    case worktrees
}

// MARK: - Repo Row

private struct RepoRow: View {
    let repo: Repo

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: repo.localPath?.isEmpty == false ? "folder.badge.gearshape" : "folder.badge.questionmark")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(repo.localPath?.isEmpty == false ? IssueCTLColors.action : .secondary)
                .frame(width: 32, height: 32)
                .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .firstTextBaseline) {
                    Text(repo.fullName)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)

                    Spacer(minLength: 8)

                    SetupStatusPill(
                        title: repo.localPath?.isEmpty == false ? "Ready" : "Path needed",
                        systemImage: repo.localPath?.isEmpty == false ? "checkmark.circle.fill" : "exclamationmark.circle",
                        tint: repo.localPath?.isEmpty == false ? .green : .orange
                    )
                }

                if let localPath = repo.localPath, !localPath.isEmpty {
                    Label {
                        Text(localPath)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    } icon: {
                        Image(systemName: "externaldrive")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                } else {
                    Text("Add the local clone path before launching work sessions.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let branchPattern = repo.branchPattern, !branchPattern.isEmpty {
                    Label(branchPattern, systemImage: "arrow.triangle.branch")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .padding(.top, 8)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
    }

    private var accessibilityLabel: String {
        let pathState = repo.localPath?.isEmpty == false ? "local path configured" : "local path needed"
        return "\(repo.fullName), \(pathState)"
    }
}

private struct SettingsStatusCard: View {
    let serverURL: String
    let username: String?
    let repoCount: Int
    let serverVersion: String?
    let appVersion: String
    let healthError: String?
    let isLoading: Bool
    let retry: () -> Void

    private var statusTitle: String {
        if isLoading { return "Checking" }
        return healthError == nil ? "Connected" : "Needs Attention"
    }

    private var statusIcon: String {
        if isLoading { return "arrow.clockwise" }
        return healthError == nil ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
    }

    private var statusTint: Color {
        if isLoading { return .secondary }
        return healthError == nil ? .green : .orange
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: statusIcon)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(statusTint)
                    .frame(width: 38, height: 38)
                    .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10))

                VStack(alignment: .leading, spacing: 4) {
                    Text(statusTitle)
                        .font(.headline)
                    Text(serverURL)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }

                Spacer(minLength: 8)

                if isLoading {
                    ProgressView()
                } else if healthError != nil {
                    Button(action: retry) {
                        Image(systemName: "arrow.clockwise")
                            .frame(width: 32, height: 32)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .accessibilityLabel("Retry server check")
                }
            }

            HStack(spacing: 8) {
                SettingsSummaryMetric(title: "Repos", value: "\(repoCount)", systemImage: "folder")
                SettingsSummaryMetric(title: "Token", value: "Saved", systemImage: "key.fill")
                SettingsSummaryMetric(title: "App", value: appVersion, systemImage: "iphone")
            }

            if let username {
                Label(username, systemImage: "person.crop.circle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let serverVersion {
                Label("Server \(serverVersion)", systemImage: "server.rack")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let healthError {
                Text(healthError)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
        .accessibilityElement(children: .contain)
    }
}

private struct SettingsSummaryMetric: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(title, systemImage: systemImage)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .labelStyle(.titleAndIcon)
            Text(value)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 8))
    }
}

private struct SetupStatusPill: View {
    let title: String
    let systemImage: String
    let tint: Color

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.caption2.weight(.semibold))
            .labelStyle(.titleAndIcon)
            .lineLimit(1)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .foregroundStyle(tint)
            .background(tint.opacity(0.12), in: Capsule())
    }
}
