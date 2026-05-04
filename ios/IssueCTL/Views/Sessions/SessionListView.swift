import SwiftUI

struct SessionListView: View {
    @Environment(APIClient.self) private var api
    @Environment(\.scenePhase) private var scenePhase
    let onShowSettings: () -> Void
    let onShowIssues: () -> Void

    @State private var repos: [Repo] = []
    @State private var deployments: [ActiveDeployment] = []
    @State private var previews: [Int: SessionPreview] = [:]
    @State private var expandedPorts: Set<Int> = []
    @State private var isLoading = true
    @State private var isFetchingPreviews = false
    @State private var errorMessage: String?
    @State private var actionError: String?
    @State private var terminalPresentation: TerminalPresentation?
    @State private var sessionControlsTarget: ActiveDeployment?
    @State private var showCreateSheet = false
    @State private var endingDeploymentId: Int?
    @State private var navigationPath = NavigationPath()
    @State private var searchText = ""
    @State private var isSearchVisible = false
    @FocusState private var isSearchFocused: Bool

    private let refreshTimer = Timer.publish(every: 10, on: .main, in: .common).autoconnect()

    private var filteredDeployments: [ActiveDeployment] {
        guard !searchText.isEmpty else { return deployments }
        let query = searchText.lowercased()
        return deployments.filter { deployment in
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
    }

    private var readyCount: Int {
        deployments.filter { $0.ttydPort != nil }.count
    }

    private var activeTerminalCount: Int {
        deployments.filter { deployment in
            guard let port = deployment.ttydPort else { return false }
            return previews[port]?.status == .active
        }.count
    }

    private var idleTerminalCount: Int {
        deployments.filter { deployment in
            guard let port = deployment.ttydPort else { return false }
            return previews[port]?.status == .idle
        }.count
    }

    private var checkingTerminalCount: Int {
        deployments.filter { deployment in
            guard let port = deployment.ttydPort else { return false }
            return previews[port] == nil
        }.count
    }

    private var startingCount: Int {
        deployments.count - readyCount
    }

    private var activeRepoFullNames: [String] {
        let names = Set(deployments.map(\.repoFullName))
        return repos.map(\.fullName).filter { names.contains($0) }
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            VStack(spacing: 0) {
                if isSearchVisible {
                    sessionSearchBar
                } else {
                    sessionHeader
                }

                RepoContextStrip(repos: repos, activeRepoFullNames: activeRepoFullNames)

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
                                ActiveSessionsHeader(
                                    totalCount: deployments.count,
                                    activeCount: activeTerminalCount,
                                    idleCount: idleTerminalCount,
                                    checkingCount: checkingTerminalCount,
                                    startingCount: startingCount
                                )

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
                                        Button("Clear Search", action: hideSearch)
                                    }
                                    .padding(.top, 18)
                                }

                                ForEach(filteredDeployments) { deployment in
                                    let port = deployment.ttydPort
                                    SessionRowView(
                                        deployment: deployment,
                                        preview: port.flatMap { previews[$0] },
                                        isPreviewExpanded: port.map { expandedPorts.contains($0) } ?? false,
                                        isEnding: endingDeploymentId == deployment.id,
                                        onTogglePreview: {
                                            if let port {
                                                togglePreview(port)
                                            }
                                        },
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

        var parts = [
            "\(activeTerminalCount) active",
            "\(idleTerminalCount) idle",
        ]
        if checkingTerminalCount > 0 {
            parts.append("\(checkingTerminalCount) checking")
        }
        if startingCount > 0 {
            parts.append("\(startingCount) starting")
        }
        return parts.joined(separator: " • ")
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

    private func sessionErrorDescription(_ message: String) -> String {
        "\(message)\n\nRetry after starting issuectl web, or open Settings to update the server."
    }

    private func openTerminal(_ deployment: ActiveDeployment) {
        guard deployment.ttydPort != nil else { return }
        terminalPresentation = TerminalPresentation(deployment: deployment)
    }

    private func togglePreview(_ port: Int) {
        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
            if expandedPorts.contains(port) {
                expandedPorts.remove(port)
            } else {
                expandedPorts.insert(port)
            }
        }
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
            expandedPorts = []
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
                expandedPorts = []
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
        expandedPorts = expandedPorts.intersection(ports)
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
                expandedPorts.remove(port)
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

private struct ActiveSessionsHeader: View {
    let totalCount: Int
    let activeCount: Int
    let idleCount: Int
    let checkingCount: Int
    let startingCount: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("\(totalCount) running")
                    .font(.title3.bold())
                Text("Re-enter terminals without losing active agent work.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            HStack(spacing: 10) {
                metric(value: "\(activeCount)", label: "active", systemImage: "bolt.fill", accessibilityIdentifier: "sessions-active-count")
                metric(value: "\(idleCount)", label: "idle", systemImage: "pause.circle", accessibilityIdentifier: "sessions-idle-count")
                if checkingCount > 0 {
                    metric(value: "\(checkingCount)", label: "checking", systemImage: "dot.radiowaves.left.and.right", accessibilityIdentifier: "sessions-checking-count")
                }
                metric(value: "\(startingCount)", label: "starting", systemImage: "hourglass", accessibilityIdentifier: "sessions-starting-count")
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
        .accessibilityIdentifier("sessions-command-header")
    }

    private func metric(
        value: String,
        label: String,
        systemImage: String,
        accessibilityIdentifier: String
    ) -> some View {
        HStack(spacing: 7) {
            Image(systemName: systemImage)
                .font(.caption)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(.subheadline.bold())
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(IssueCTLColors.elevatedBackground, in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label) sessions")
        .accessibilityValue(value)
        .accessibilityIdentifier(accessibilityIdentifier)
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
