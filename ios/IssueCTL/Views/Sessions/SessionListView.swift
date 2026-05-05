import SwiftUI

struct SessionListView: View {
    @Environment(APIClient.self) private var api
    @Environment(\.scenePhase) private var scenePhase
    let onShowSettings: () -> Void
    let onShowIssues: () -> Void

    @State private var repos: [Repo] = []
    @State private var deployments: [ActiveDeployment] = []
    @State private var previews: [Int: SessionPreview] = [:]
    @State private var isLoading = true
    @State private var isFetchingPreviews = false
    @State private var errorMessage: String?
    @State private var actionError: String?
    @State private var cachedDeploymentsAt: Date?
    @State private var isShowingCachedDeployments = false
    @State private var terminalPresentation: TerminalPresentation?
    @State private var sessionControlsTarget: ActiveDeployment?
    @State private var showCreateSheet = false
    @State private var endingDeploymentId: Int?
    @State private var navigationPath = NavigationPath()
    @State private var searchText = ""
    @State private var isSearchVisible = false
    @State private var selectedRepoIds: Set<Int> = []
    @State private var showFiltersSheet = false
    @FocusState private var isSearchFocused: Bool

    private let refreshTimer = Timer.publish(every: 10, on: .main, in: .common).autoconnect()

    private var filteredDeployments: [ActiveDeployment] {
        var items = deployments

        if !selectedRepoIds.isEmpty {
            items = items.filter { selectedRepoIds.contains($0.repoId) }
        }

        if searchText.isEmpty {
            return sortDeploymentsForInvestigation(items)
        }

        let query = searchText.lowercased()
        let matchingItems = items.filter { deployment in
            [
                deployment.repoFullName,
                "#\(deployment.issueNumber)",
                deployment.branchName,
                deployment.ttydPort.map(String.init) ?? "starting",
            ]
            .compactMap { $0 }
            .joined(separator: " ")
            .lowercased()
            .contains(query)
        }
        return sortDeploymentsForInvestigation(matchingItems)
    }

    private var hasActiveFilters: Bool {
        !selectedRepoIds.isEmpty
    }

    private var selectedRepoSummary: String {
        let names = repos
            .filter { selectedRepoIds.contains($0.id) }
            .map(\.name)

        if selectedRepoIds.isEmpty {
            return repos.count > 1 ? "All \(repos.count)" : repos.first?.name ?? "None"
        }
        if names.isEmpty {
            return "\(selectedRepoIds.count) selected"
        }
        if names.count <= 2 {
            return names.joined(separator: ", ")
        }
        return "\(names[0]), \(names[1]) +\(names.count - 2)"
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            VStack(spacing: 0) {
                if isSearchVisible {
                    sessionSearchBar
                } else {
                    sessionHeader
                }

                RepoContextStrip(
                    repos: repos,
                    valueOverride: selectedRepoSummary,
                    showsActiveSummary: false,
                    onTap: { showFiltersSheet = true }
                )

                Group {
                    if isLoading && deployments.isEmpty {
                        ProgressView("Loading sessions...")
                    } else if let errorMessage {
                        ContentUnavailableView {
                            Label("Error", systemImage: "exclamationmark.triangle")
                        } description: {
                            Text(sessionErrorDescription(errorMessage))
                        } actions: {
                            HStack {
                                Button("Retry") { Task { await refreshSessions() } }
                                Button("Open Settings", action: onShowSettings)
                            }
                        }
                    } else if deployments.isEmpty {
                        ContentUnavailableView {
                            Label("No Active Sessions", systemImage: "play.circle")
                        } description: {
                            Text("Launch an agent from an issue, then return here to open terminals and end sessions.")
                        } actions: {
                            HStack {
                                Button("Open Issues", action: onShowIssues)
                                Button("Refresh") { Task { await refreshSessions() } }
                            }
                        }
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 12) {
                                if isShowingCachedDeployments {
                                    OfflineStatusBanner(message: staleDataMessage(kind: "sessions", cachedAt: cachedDeploymentsAt))
                                }

                                if let actionError {
                                    Label(actionError, systemImage: "exclamationmark.triangle")
                                        .foregroundStyle(.red)
                                        .font(.subheadline)
                                        .lineLimit(3)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }

                                if filteredDeployments.isEmpty {
                                    ContentUnavailableView {
                                        Label("No Matching Sessions", systemImage: "magnifyingglass")
                                    } description: {
                                        Text("Try another repo, issue number, branch, or port.")
                                    } actions: {
                                        Button(hasActiveFilters ? "Clear Filters" : "Clear Search", action: resetFiltersAndSearch)
                                    }
                                    .padding(.top, 18)
                                }

                                ForEach(filteredDeployments) { deployment in
                                    let port = deployment.ttydPort
                                    SessionRowView(
                                        deployment: deployment,
                                        preview: port.flatMap { previews[$0] },
                                        isEnding: endingDeploymentId == deployment.id,
                                        onOpen: {
                                            openTerminal(deployment)
                                        },
                                        onControls: {
                                            sessionControlsTarget = deployment
                                        }
                                    )
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.top, 16)
                        }
                        .refreshable { await refreshSessions() }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .navigationDestination(for: IssueDestination.self) { dest in
                IssueDetailView(owner: dest.owner, repo: dest.repo, number: dest.number)
            }
            .task { await load() }
            .task(id: scenePhase) {
                await pollPreviews()
            }
            .onReceive(refreshTimer) { _ in
                guard terminalPresentation == nil else { return }
                Task { await load(includeRepos: false) }
            }
            .autoDismissError($actionError)
            .interactivePopDisabled(isAtRoot: navigationPath.isEmpty)
            .accessibilityTabBarClearance()
            .fullScreenCover(item: $terminalPresentation) { presentation in
                let deployment = presentation.deployment
                if let port = deployment.ttydPort {
                    TerminalView(
                        deployment: deployment,
                        port: port,
                        onClose: {
                            terminalPresentation = nil
                        },
                        onEnd: {
                            terminalPresentation = nil
                            deployments.removeAll { $0.id == deployment.id }
                        }
                    )
                }
            }
            .sheet(item: $sessionControlsTarget) { deployment in
                SessionControlsSheet(
                    deployment: deployment,
                    isEnding: endingDeploymentId == deployment.id,
                    onOpenTerminal: {
                        sessionControlsTarget = nil
                        openTerminal(deployment)
                    },
                    onViewIssue: {
                        sessionControlsTarget = nil
                        navigationPath.append(IssueDestination(
                            owner: deployment.owner,
                            repo: deployment.repoName,
                            number: deployment.issueNumber
                        ))
                    },
                    onEnd: {
                        Task {
                            await endSession(deployment)
                            sessionControlsTarget = nil
                        }
                    }
                )
                .presentationDetents([.height(330), .medium])
                .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showCreateSheet) {
                QuickCreateSheet(repos: repos, onSuccess: { warning in
                    if let warning { actionError = warning }
                    Task { await load(refresh: true) }
                })
            }
            .sheet(isPresented: $showFiltersSheet) {
                SessionFilterSheet(
                    repos: repos,
                    selectedRepoIds: $selectedRepoIds,
                    selectedRepoSummary: selectedRepoSummary
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
        }
    }

    private var sessionHeader: some View {
        AppTopBar(title: "Sessions", subtitle: sessionSubtitle) {
            HStack(spacing: 8) {
                TopBarIconButton(
                    title: "Search sessions",
                    systemImage: "magnifyingglass",
                    accessibilityIdentifier: "sessions-search-button"
                ) {
                    showSearch()
                }

                TopBarIconButton(
                    title: "Refresh sessions",
                    systemImage: "arrow.clockwise",
                    accessibilityIdentifier: "sessions-refresh-button"
                ) {
                    Task { await refreshSessions() }
                }

                TopBarIconButton(
                    title: "Session filters",
                    systemImage: "line.3.horizontal.decrease",
                    accessibilityIdentifier: "sessions-filter-button",
                    showsActiveIndicator: hasActiveFilters
                ) {
                    showFiltersSheet = true
                }

                TopBarIconButton(
                    title: "Create Issue",
                    systemImage: "plus",
                    accessibilityIdentifier: "sessions-create-issue-button",
                    isProminent: true
                ) {
                    showCreateSheet = true
                }
            }
        }
    }

    private var sessionSubtitle: String {
        if deployments.isEmpty {
            return "No active sessions"
        }

        return "Running sessions"
    }

    private var sessionSearchBar: some View {
        HStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)

                TextField("Search sessions", text: $searchText)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($isSearchFocused)
                    .submitLabel(.search)
                    .accessibilityIdentifier("sessions-search-field")
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: 14))
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
            }

            Button("Cancel", action: hideSearch)
                .frame(minHeight: 44)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }

    private func showSearch() {
        isSearchVisible = true
        Task { @MainActor in
            isSearchFocused = true
        }
    }

    private func hideSearch() {
        searchText = ""
        isSearchFocused = false
        isSearchVisible = false
    }

    private func resetFiltersAndSearch() {
        selectedRepoIds.removeAll()
        hideSearch()
    }

    private func sortDeploymentsForInvestigation(_ items: [ActiveDeployment]) -> [ActiveDeployment] {
        items
            .enumerated()
            .sorted { lhs, rhs in
                let lhsRank = sessionSortRank(lhs.element)
                let rhsRank = sessionSortRank(rhs.element)
                if lhsRank != rhsRank {
                    return lhsRank < rhsRank
                }
                return lhs.offset < rhs.offset
            }
            .map(\.element)
    }

    private func sessionSortRank(_ deployment: ActiveDeployment) -> Int {
        guard let port = deployment.ttydPort else {
            return 4
        }

        switch previews[port]?.status {
        case .idle:
            return 0
        case .error:
            return 1
        case .unavailable, nil:
            return 2
        case .active:
            return 3
        }
    }

    private func sessionErrorDescription(_ message: String) -> String {
        "\(message)\n\nRetry after starting issuectl web, or open Settings to update the server."
    }

    private func openTerminal(_ deployment: ActiveDeployment) {
        guard deployment.ttydPort != nil else { return }
        terminalPresentation = TerminalPresentation(deployment: deployment)
    }

    private func load(refresh: Bool = false, includeRepos: Bool? = nil) async {
        let shouldLoadRepos = includeRepos ?? (refresh || repos.isEmpty)
        let trace = PerformanceTrace.begin("sessions.load", metadata: "refresh=\(refresh) include_repos=\(shouldLoadRepos)")
        if deployments.isEmpty { isLoading = true }
        errorMessage = nil
        if refresh { actionError = nil }
        defer {
            PerformanceTrace.end(trace, metadata: "deployments=\(deployments.count) repos=\(repos.count)")
        }
        do {
            async let deploymentsResult = api.activeDeployments()
            async let reposResult: Result<[Repo], Error>? = shouldLoadRepos ? {
                do { return .success(try await api.repos()) }
                catch { return .failure(error) }
            }() : nil
            let response = try await deploymentsResult
            deployments = response.deployments
            isShowingCachedDeployments = response.fromCache
            cachedDeploymentsAt = response.cachedAt.flatMap(parseIssueCTLDate)
            prunePreviewState()
            if let reposResult = await reposResult {
                switch reposResult {
                case .success(let loadedRepos):
                    repos = loadedRepos
                case .failure(let error):
                    if repos.isEmpty {
                        actionError = "Failed to load repos for create: \(error.localizedDescription)"
                    }
                }
            }
        } catch {
            if deployments.isEmpty {
                errorMessage = error.localizedDescription
            }
        }
        isLoading = false
    }

    private func fetchPreviews() async {
        guard !isFetchingPreviews else { return }
        guard !deployments.isEmpty else {
            previews = [:]
            return
        }
        isFetchingPreviews = true
        defer { isFetchingPreviews = false }
        do {
            let response = try await api.sessionPreviews()
            previews = response.previewsByPort
            prunePreviewState()
        } catch {
            // Preview data is supplementary; keep the session list usable if
            // the endpoint is temporarily unavailable.
        }
    }

    private func pollPreviews() async {
        guard scenePhase == .active else { return }
        while !Task.isCancelled {
            if deployments.isEmpty {
                previews = [:]
            } else {
                await fetchPreviews()
            }
            try? await Task.sleep(for: .seconds(2))
        }
    }

    private func refreshSessions() async {
        await load(refresh: true)
        await fetchPreviews()
    }

    private func prunePreviewState() {
        let ports = Set(deployments.compactMap(\.ttydPort))
        previews = previews.filter { ports.contains($0.key) }
    }

    private func endSession(_ deployment: ActiveDeployment) async {
        endingDeploymentId = deployment.id
        do {
            _ = try await api.endSession(
                deploymentId: deployment.id,
                owner: deployment.owner,
                repo: deployment.repoName,
                issueNumber: deployment.issueNumber
            )
            deployments.removeAll { $0.id == deployment.id }
            if let port = deployment.ttydPort {
                previews.removeValue(forKey: port)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        endingDeploymentId = nil
    }
}

private struct TerminalPresentation: Identifiable {
    let id = UUID()
    let deployment: ActiveDeployment
}

private struct SessionFilterSheet: View {
    let repos: [Repo]
    @Binding var selectedRepoIds: Set<Int>
    let selectedRepoSummary: String

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    sheetHeader

                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 8) {
                            Label("Repository", systemImage: "tray.2")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            Spacer()
                            if !selectedRepoIds.isEmpty {
                                Button("Clear") {
                                    selectedRepoIds.removeAll()
                                }
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(IssueCTLColors.action)
                                .buttonStyle(.plain)
                            }
                        }

                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                            Button {
                                selectedRepoIds.removeAll()
                            } label: {
                                optionContent(title: "All Repos", subtitle: "\(repos.count) configured", isSelected: selectedRepoIds.isEmpty)
                            }
                            .buttonStyle(.plain)

                            ForEach(repos) { repo in
                                let isSelected = selectedRepoIds.contains(repo.id)
                                Button {
                                    if isSelected {
                                        selectedRepoIds.remove(repo.id)
                                    } else {
                                        selectedRepoIds.insert(repo.id)
                                    }
                                } label: {
                                    optionContent(title: repo.name, subtitle: repo.owner, isSelected: isSelected)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(12)
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
                }
                .padding(16)
            }
        }
    }

    private var sheetHeader: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Filters")
                    .font(.title3.bold())
                Text("Showing \(selectedRepoSummary)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if !selectedRepoIds.isEmpty {
                Button("Reset") {
                    selectedRepoIds.removeAll()
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(IssueCTLColors.action)
                .buttonStyle(.plain)
            }
        }
    }

    private func optionContent(title: String, subtitle: String, isSelected: Bool) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
        .padding(10)
        .background(isSelected ? IssueCTLColors.action.opacity(0.14) : Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(isSelected ? IssueCTLColors.action.opacity(0.55) : Color.clear, lineWidth: 1)
        }
    }
}

private struct SessionControlsSheet: View {
    let deployment: ActiveDeployment
    let isEnding: Bool
    let onOpenTerminal: () -> Void
    let onViewIssue: () -> Void
    let onEnd: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text("#\(deployment.issueNumber) Session")
                    .font(.title2.weight(.bold))
                Text(deployment.repoFullName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 0) {
                sheetAction(
                    title: "Open Terminal",
                    subtitle: deployment.ttydPort.map { "Port \($0)" } ?? "Terminal is still preparing.",
                    systemImage: "terminal",
                    isDisabled: deployment.ttydPort == nil,
                    action: onOpenTerminal
                )

                Divider()

                sheetAction(
                    title: "View Issue",
                    subtitle: "Jump to #\(deployment.issueNumber) without losing this session.",
                    systemImage: "number",
                    action: onViewIssue
                )

                Divider()

                Button(role: .destructive, action: onEnd) {
                    HStack(spacing: 12) {
                        Image(systemName: "stop.circle")
                            .frame(width: 26)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(isEnding ? "Ending Session" : "End Session")
                                .font(.subheadline.weight(.semibold))
                            Text("Stop ttyd and mark deployment ended.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if isEnding {
                            ProgressView()
                                .controlSize(.small)
                        }
                    }
                    .padding(12)
                }
                .disabled(isEnding)
            }
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))

            Spacer(minLength: 0)
        }
        .padding(16)
    }

    private func sheetAction(
        title: String,
        subtitle: String,
        systemImage: String,
        isDisabled: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .frame(width: 26)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tertiary)
            }
            .padding(12)
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.55 : 1)
    }
}
