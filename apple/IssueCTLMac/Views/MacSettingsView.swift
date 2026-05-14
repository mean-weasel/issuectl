import AppKit
import SwiftUI

struct MacSettingsView: View {
    @Environment(APIClient.self) private var api
    @Environment(MacSidebarPreferences.self) private var preferences
    @Environment(SpaceSidebarCoordinator.self) private var sidebarCoordinator
    @Environment(\.resetSidebarLayout) private var resetSidebarLayout
    @State private var isUpdatingLaunchAtLogin = false
    @State private var repos: [Repo] = []
    @State private var isLoadingRepos = false
    @State private var repoError: String?
    @State private var showAddRepo = false
    @State private var editingRepo: Repo?
    @State private var repoPendingRemoval: Repo?
    @State private var removingRepoFullName: String?

    var body: some View {
        Form {
            Section("Connection") {
                Text(api.serverURL.isEmpty ? "Not configured" : api.serverURL)
                Text(api.apiToken.isEmpty ? "No API token saved" : "API token saved")
                    .foregroundStyle(.secondary)
            }

            Section("Mac Sidebar") {
                Toggle("Launch at Login", isOn: launchAtLoginBinding)
                    .disabled(isUpdatingLaunchAtLogin)

                if isUpdatingLaunchAtLogin {
                    ProgressView()
                        .controlSize(.small)
                }

                if let error = preferences.launchAtLoginError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Text Size")
                        Spacer()
                        Text("\(Int(preferences.textScale * 100))%")
                            .foregroundStyle(.secondary)
                    }

                    Slider(
                        value: textScaleBinding,
                        in: MacSidebarPreferences.minimumTextScale...MacSidebarPreferences.maximumTextScale,
                        step: 0.05
                    )

                    HStack {
                        Text("Smaller")
                        Spacer()
                        Text("Larger")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }

            Section("Repositories") {
                HStack {
                    Button {
                        showAddRepo = true
                    } label: {
                        Label("Add Repository", systemImage: "plus")
                    }
                    .accessibilityIdentifier("mac-settings-add-repository-button")

                    Spacer()

                    Button {
                        Task { await loadRepos(refresh: true) }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                    .disabled(isLoadingRepos)
                    .accessibilityIdentifier("mac-settings-refresh-repositories-button")
                }

                if isLoadingRepos && repos.isEmpty {
                    ProgressView("Loading repositories...")
                        .accessibilityIdentifier("mac-settings-repositories-loading")
                } else if let repoError, repos.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Label(repoError, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("mac-settings-repositories-error")
                        Button("Retry") {
                            Task { await loadRepos(refresh: true) }
                        }
                    }
                } else if repos.isEmpty {
                    ContentUnavailableView(
                        "No Repositories",
                        systemImage: "folder",
                        description: Text("Add a repo to populate sidebar issue filters.")
                    )
                    .accessibilityIdentifier("mac-settings-repositories-empty")
                } else {
                    ForEach(repos) { repo in
                        MacSettingsRepoRow(
                            repo: repo,
                            isRemoving: removingRepoFullName == repo.fullName,
                            onEdit: { editingRepo = repo },
                            onRemove: { repoPendingRemoval = repo }
                        )
                    }
                }

                if let repoError, !repos.isEmpty {
                    Label(repoError, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                        .font(.caption)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("mac-settings-repositories-refresh-error")
                }

                Button("Open Web Settings") {
                    openWebSettings()
                }
                .accessibilityIdentifier("mac-settings-open-web-settings-button")
            }

            Section("Learned Desktops") {
                if sidebarCoordinator.spaceStates.isEmpty {
                    Text("No desktops learned yet")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(sidebarCoordinator.spaceStates, id: \.id) { spaceState in
                        spaceSettingsRow(spaceState)
                    }
                }

                Button("Reset All Desktop Sidebar Layouts") {
                    resetSidebarLayout()
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 460)
        .frame(minHeight: 560)
        .padding()
        .accessibilityIdentifier("mac-settings-view")
        .sheet(isPresented: $showAddRepo) {
            MacAddRepoSheet(trackedRepos: repos) { repo in
                upsertRepo(repo)
                await refreshSidebarAfterRepoMutation()
            }
            .environment(api)
        }
        .sheet(item: $editingRepo) { repo in
            MacEditRepoSheet(repo: repo) { updated in
                upsertRepo(updated)
                await refreshSidebarAfterRepoMutation()
            }
            .environment(api)
        }
        .confirmationDialog(
            "Remove repository?",
            isPresented: Binding(
                get: { repoPendingRemoval != nil },
                set: { if !$0 { repoPendingRemoval = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let repo = repoPendingRemoval {
                Button("Remove \(repo.fullName)", role: .destructive) {
                    Task { await remove(repo) }
                }
            }
            Button("Cancel", role: .cancel) {
                repoPendingRemoval = nil
            }
        } message: {
            if let repo = repoPendingRemoval {
                Text("This removes \(repo.fullName) from tracked repositories and sidebar filters.")
            }
        }
        .task {
            preferences.refreshLaunchAtLoginStatus()
            await loadRepos(refresh: false)
        }
    }

    private var launchAtLoginBinding: Binding<Bool> {
        Binding(
            get: { preferences.launchAtLogin },
            set: { newValue in
                isUpdatingLaunchAtLogin = true
                Task {
                    await preferences.setLaunchAtLogin(newValue)
                    isUpdatingLaunchAtLogin = false
                }
            }
        )
    }

    private var textScaleBinding: Binding<Double> {
        Binding(
            get: { preferences.textScale },
            set: { preferences.textScale = MacSidebarPreferences.clampedTextScale($0) }
        )
    }

    private func openWebSettings() {
        let baseURL = api.serverURL.isEmpty ? "http://localhost:3847" : api.serverURL
        let trimmedBaseURL = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(trimmedBaseURL)/settings") else { return }
        NSWorkspace.shared.open(url)
    }

    private func loadRepos(refresh: Bool) async {
        isLoadingRepos = true
        defer { isLoadingRepos = false }

        do {
            repos = try await api.repos(refresh: refresh)
            repoError = nil
            syncSidebarRepoFilters()
        } catch {
            repoError = error.localizedDescription
        }
    }

    private func upsertRepo(_ repo: Repo) {
        if let index = repos.firstIndex(where: { $0.id == repo.id || $0.fullName == repo.fullName }) {
            repos[index] = repo
        } else {
            repos.insert(repo, at: 0)
        }
        syncSidebarRepoFilters()
    }

    private func remove(_ repo: Repo) async {
        repoPendingRemoval = nil
        removingRepoFullName = repo.fullName
        repoError = nil
        defer { removingRepoFullName = nil }

        do {
            try await api.removeRepo(owner: repo.owner, name: repo.name)
            repos.removeAll { $0.id == repo.id || $0.fullName == repo.fullName }
            await refreshSidebarAfterRepoMutation()
        } catch {
            repoError = "Failed to remove \(repo.fullName): \(error.localizedDescription)"
            await loadRepos(refresh: true)
        }
    }

    private func refreshSidebarAfterRepoMutation() async {
        syncSidebarRepoFilters()
        await sidebarCoordinator.store.load(api: api, refresh: true)
        syncSidebarRepoFilters()
    }

    private func syncSidebarRepoFilters() {
        for state in sidebarCoordinator.spaceStates {
            state.issueFilterState.syncRepoSelection(repos: repos)
        }
    }

    private func spaceSettingsRow(_ spaceState: MacSidebarSpaceState) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(spaceState.title)
                        .font(.headline)
                    Text(spaceState.id == sidebarCoordinator.currentSpaceState?.id ? "Current desktop" : "Learned desktop")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(spaceState.chrome.isVisible ? "Visible" : "Hidden")
                    .foregroundStyle(.secondary)
            }

            Toggle("Open Collapsed", isOn: Binding(
                get: { spaceState.preferences.isCollapsed },
                set: { newValue in
                    spaceState.preferences.isCollapsed = newValue
                    if spaceState.chrome.isCollapsed != newValue {
                        sidebarCoordinator.toggleCollapsed(spaceKey: spaceState.id)
                    }
                }
            ))

            HStack {
                Text("Saved Width")
                Spacer()
                Text("\(Int(spaceState.preferences.expandedWidth)) px")
                    .foregroundStyle(.secondary)
            }

            HStack {
                Button(spaceState.chrome.isVisible ? "Hide" : "Show") {
                    sidebarCoordinator.toggleVisibility(spaceKey: spaceState.id)
                }
                Button(spaceState.chrome.isCollapsed ? "Expand" : "Collapse") {
                    sidebarCoordinator.toggleCollapsed(spaceKey: spaceState.id)
                }
                Button("Reset") {
                    sidebarCoordinator.resetLayout(spaceKey: spaceState.id)
                }
            }
        }
        .padding(.vertical, 6)
    }
}

private struct MacSettingsRepoRow: View {
    let repo: Repo
    let isRemoving: Bool
    let onEdit: () -> Void
    let onRemove: () -> Void

    private var hasLocalPath: Bool {
        repo.localPath?.isEmpty == false
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: hasLocalPath ? "folder.badge.gearshape" : "folder.badge.questionmark")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(hasLocalPath ? .blue : .orange)
                .frame(width: 30, height: 30)

            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text(repo.fullName)
                        .font(.headline)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer()
                    Text(hasLocalPath ? "Ready" : "Path needed")
                        .font(.caption)
                        .foregroundStyle(hasLocalPath ? .green : .orange)
                }

                if let localPath = repo.localPath, !localPath.isEmpty {
                    Label(localPath, systemImage: "externaldrive")
                        .lineLimit(1)
                        .truncationMode(.middle)
                } else {
                    Text("Add a local clone path before launching work sessions.")
                }

                Label(repo.branchPattern?.isEmpty == false ? repo.branchPattern! : "Default branch pattern", systemImage: "arrow.triangle.branch")
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            Spacer(minLength: 8)

            if isRemoving {
                ProgressView()
                    .controlSize(.small)
            } else {
                Menu {
                    Button("Edit") {
                        onEdit()
                    }
                    .accessibilityIdentifier("mac-settings-edit-repository-\(repo.fullName)")

                    Button("Remove", role: .destructive) {
                        onRemove()
                    }
                    .accessibilityIdentifier("mac-settings-remove-repository-\(repo.fullName)")
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .menuStyle(.button)
                .accessibilityIdentifier("mac-settings-repository-menu-\(repo.fullName)")
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("mac-settings-repository-row-\(repo.fullName)")
    }
}

private struct MacAddRepoSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss
    let trackedRepos: [Repo]
    let onAdded: (Repo) async -> Void

    @State private var fullName = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var browseRepos: [GitHubAccessibleRepo] = []
    @State private var browseSearch = ""
    @State private var browseError: String?
    @State private var isBrowseLoading = false

    private var trackedFullNames: Set<String> {
        Set(trackedRepos.map(\.fullName))
    }

    private var parsedInput: MacRepoNameInput? {
        try? MacRepoNameInput.parse(fullName)
    }

    private var filteredBrowseRepos: [GitHubAccessibleRepo] {
        guard !browseSearch.isEmpty else { return browseRepos }
        let query = browseSearch.lowercased()
        return browseRepos.filter { $0.fullName.lowercased().contains(query) }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Manual") {
                    TextField("owner/name", text: $fullName)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("mac-add-repo-full-name-field")

                    if let parsedInput {
                        Text("Will add \(parsedInput.fullName)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else if !fullName.isEmpty {
                        Text(MacRepoNameInputError.invalidFormat.localizedDescription)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }

                Section("Browse GitHub") {
                    HStack {
                        TextField("Search repos", text: $browseSearch)
                            .textFieldStyle(.roundedBorder)
                            .accessibilityIdentifier("mac-add-repo-browse-search-field")
                        Button {
                            Task { await loadBrowseRepos(refresh: true) }
                        } label: {
                            Label("Refresh", systemImage: "arrow.clockwise")
                        }
                        .disabled(isBrowseLoading)
                        .accessibilityIdentifier("mac-add-repo-browse-refresh-button")
                    }

                    if isBrowseLoading && browseRepos.isEmpty {
                        ProgressView("Loading GitHub repos...")
                    } else if let browseError {
                        Label(browseError, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .accessibilityIdentifier("mac-add-repo-browse-error")
                    } else if browseRepos.isEmpty {
                        Text("Refresh to load accessible GitHub repositories.")
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("mac-add-repo-browse-empty")
                    } else {
                        ForEach(filteredBrowseRepos) { repo in
                            Button {
                                fullName = repo.fullName
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(repo.fullName)
                                            .foregroundStyle(.primary)
                                        if let pushedAt = repo.pushedAt {
                                            Text("Pushed \(pushedAt)")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    Spacer()
                                    if trackedFullNames.contains(repo.fullName) {
                                        Text("Tracked")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    } else if repo.private {
                                        Image(systemName: "lock.fill")
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .disabled(trackedFullNames.contains(repo.fullName))
                            .accessibilityIdentifier("mac-add-repo-browse-row-\(repo.fullName)")
                        }
                    }
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .accessibilityIdentifier("mac-add-repo-error")
                    }
                }
            }
            .navigationTitle("Add Repository")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSubmitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Button("Add") {
                            Task { await submit() }
                        }
                        .disabled(parsedInput == nil)
                        .accessibilityIdentifier("mac-add-repo-submit-button")
                    }
                }
            }
            .frame(width: 460, height: 520)
            .task {
                await loadBrowseRepos(refresh: false)
            }
        }
    }

    private func loadBrowseRepos(refresh: Bool) async {
        isBrowseLoading = true
        browseError = nil
        defer { isBrowseLoading = false }

        do {
            browseRepos = try await api.githubRepos(refresh: refresh).repos
        } catch {
            browseError = error.localizedDescription
        }
    }

    private func submit() async {
        do {
            let input = try MacRepoNameInput.parse(fullName)
            isSubmitting = true
            errorMessage = nil
            defer { isSubmitting = false }

            let repo = try await api.addRepo(owner: input.owner, name: input.name)
            await onAdded(repo)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct MacEditRepoSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss
    let repo: Repo
    let onUpdated: (Repo) async -> Void

    @State private var localPath: String
    @State private var branchPattern: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(repo: Repo, onUpdated: @escaping (Repo) async -> Void) {
        self.repo = repo
        self.onUpdated = onUpdated
        _localPath = State(initialValue: repo.localPath ?? "")
        _branchPattern = State(initialValue: repo.branchPattern ?? "")
    }

    private var hasChanges: Bool {
        localPath.trimmingCharacters(in: .whitespacesAndNewlines) != (repo.localPath ?? "")
            || branchPattern.trimmingCharacters(in: .whitespacesAndNewlines) != (repo.branchPattern ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Repository") {
                    Text(repo.fullName)
                        .font(.headline)
                    Text(repo.localPath?.isEmpty == false ? "Ready for local sessions." : "Add a local clone path to improve launches.")
                        .foregroundStyle(.secondary)
                }

                Section("Local Clone") {
                    TextField("Local path", text: $localPath)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("mac-edit-repo-local-path-field")
                }

                Section("Branch Pattern") {
                    TextField("Branch pattern", text: $branchPattern)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("mac-edit-repo-branch-pattern-field")
                    Text("Leave blank to use the server default.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .accessibilityIdentifier("mac-edit-repo-error")
                    }
                }
            }
            .navigationTitle("Edit Repository")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Save") {
                            Task { await save() }
                        }
                        .disabled(!hasChanges)
                        .accessibilityIdentifier("mac-edit-repo-save-button")
                    }
                }
            }
            .frame(width: 440, height: 360)
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        do {
            let updated = try await api.updateRepo(
                owner: repo.owner,
                name: repo.name,
                localPath: localPath.trimmingCharacters(in: .whitespacesAndNewlines),
                branchPattern: branchPattern.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            await onUpdated(updated)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
