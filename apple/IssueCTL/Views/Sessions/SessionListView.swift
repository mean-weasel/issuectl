import SwiftUI
import UIKit

extension SessionsOverviewTab: SectionTabItem {
    var icon: String {
        switch self {
        case .sessions: "play.circle"
        case .reviews: "eye"
        }
    }
}

struct SessionListView: View {
    @Environment(APIClient.self) private var api
    let onShowSettings: () -> Void
    let onShowIssues: () -> Void
    @Binding private var route: AppRoute?

    @State private var repos: [Repo] = []
    @State private var overviewResponse: SessionsOverviewResponse?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var actionError: String?
    @State private var terminalPresentation: TerminalPresentation?
    @State private var ptyBridgeHandoffTarget: SessionsOverviewSession?
    @State private var sessionControlsTarget: SessionsOverviewSession?
    @State private var automationActivityTarget: RepoAutomationActivityTarget?
    @State private var diagnosticsTarget: ActiveDeployment?
    @State private var reviewDetailTarget: ReviewRunDetailTarget?
    @State private var showCreateSheet = false
    @State private var showAutomationFeed = false
    @State private var endingDeploymentId: Int?
    @State private var navigationPath = NavigationPath()
    @State private var searchText = ""
    @State private var isSearchVisible = false
    @State private var selectedRepoIds: Set<Int> = []
    @State private var selectedTab: SessionsOverviewTab = .sessions
    @State private var selectedState: SessionsOverviewStateFilter = .all
    @State private var selectedTrigger: SessionsOverviewTriggerFilter = .all
    @State private var selectedReviewStatus: ReviewRunStatusFilter = .all
    @State private var showFiltersSheet = false
    @FocusState private var isSearchFocused: Bool

    private let refreshTimer = Timer.publish(every: 10, on: .main, in: .common).autoconnect()

    init(
        onShowSettings: @escaping () -> Void,
        onShowIssues: @escaping () -> Void,
        route: Binding<AppRoute?> = .constant(nil)
    ) {
        self.onShowSettings = onShowSettings
        self.onShowIssues = onShowIssues
        self._route = route
    }

    private var overview: SessionsOverviewData? {
        overviewResponse?.overview
    }

    private var hasActiveFilters: Bool {
        !selectedRepoIds.isEmpty
            || selectedState != .all
            || selectedTrigger != .all
            || selectedReviewStatus != .all
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

    private var activeRepoFullNames: [String] {
        Array(Set((overview?.sessionGroups ?? [])
            .flatMap(\.sessions)
            .filter(\.isActive)
            .map(\.repoFullName)))
            .sorted()
    }

    private var selectedRepoQuery: String? {
        guard selectedRepoIds.count == 1,
              let repo = repos.first(where: { selectedRepoIds.contains($0.id) })
        else { return nil }
        return repo.fullName
    }

    private var filteredSessionGroups: [SessionsOverviewSessionGroup] {
        let groups = overview?.sessionGroups ?? []
        let filteredGroups: [SessionsOverviewSessionGroup]
        if selectedRepoIds.isEmpty {
            filteredGroups = groups
        } else {
            filteredGroups = groups
            .map { group in
                let sessions = group.sessions.filter { selectedRepoIds.contains($0.repoId) }
                return SessionsOverviewSessionGroup(
                    key: group.key,
                    repoFullName: group.repoFullName,
                    targetType: group.targetType,
                    targetNumber: group.targetNumber,
                    targetLabel: group.targetLabel,
                    sessions: sessions,
                    matchingSessionCount: sessions.count
                )
            }
            .filter { !$0.sessions.isEmpty }
        }
        return filteredGroups.sorted(by: sessionGroupSort)
    }

    private var filteredReviewGroups: [SessionsOverviewReviewGroup] {
        let groups = overview?.reviewGroups ?? []
        guard !selectedRepoIds.isEmpty else { return groups }
        return groups
            .map { group in
                let runs = group.runs.filter { selectedRepoIds.contains($0.repoId) }
                return SessionsOverviewReviewGroup(
                    key: group.key,
                    repoFullName: group.repoFullName,
                    owner: group.owner,
                    repoName: group.repoName,
                    prNumber: group.prNumber,
                    runs: runs,
                    matchingRunCount: runs.count
                )
            }
            .filter { !$0.runs.isEmpty }
    }

    private var hasOverviewItems: Bool {
        !filteredSessionGroups.isEmpty || !filteredReviewGroups.isEmpty
    }

    private var overviewQuerySignature: String {
        [
            selectedTab.rawValue,
            searchText,
            selectedRepoIds.sorted().map(String.init).joined(separator: ","),
            selectedState.rawValue,
            selectedTrigger.rawValue,
            selectedReviewStatus.rawValue,
        ].joined(separator: "|")
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
                    activeRepoFullNames: activeRepoFullNames,
                    valueOverride: selectedRepoSummary,
                    onTap: { showFiltersSheet = true }
                )

                SectionTabs(
                    selected: $selectedTab,
                    counts: [
                        .sessions: (overview?.summary.activeSessions ?? 0) + (overview?.summary.endedSessions ?? 0),
                        .reviews: overview?.summary.reviewRuns ?? 0,
                    ]
                )
                .padding(.top, 8)

                Group {
                    if isLoading && overviewResponse == nil {
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
                    } else if !hasOverviewItems {
                        ContentUnavailableView {
                            Label("No Sessions", systemImage: "play.circle")
                        } description: {
                            Text("Launch an agent from an issue or review a PR, then return here to open terminals and inspect history.")
                        } actions: {
                            HStack {
                                Button("Open Issues", action: onShowIssues)
                                Button("Refresh") { Task { await refreshSessions() } }
                            }
                        }
                    } else {
                        overviewContent
                        .refreshable { await refreshSessions() }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .navigationDestination(for: IssueDestination.self) { dest in
                IssueDetailView(owner: dest.owner, repo: dest.repo, number: dest.number)
            }
            .navigationDestination(for: PRDestination.self) { dest in
                PRDetailView(owner: dest.owner, repo: dest.repo, number: dest.number)
            }
            .task(id: overviewQuerySignature) {
                await load()
            }
            .onChange(of: route) { _, _ in
                applyPendingRoute()
            }
            .task {
                await streamSessionUpdates()
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
                            Task { await load(refresh: true, includeRepos: false) }
                        }
                    )
                }
            }
            .sheet(item: $sessionControlsTarget) { session in
                SessionControlsSheet(
                    session: session,
                    isEnding: endingDeploymentId == session.id,
                    onOpenTerminal: {
                        sessionControlsTarget = nil
                        openTerminal(session)
                    },
                    onViewTarget: {
                        sessionControlsTarget = nil
                        if session.isIssueTarget {
                            navigationPath.append(IssueDestination(
                                owner: session.owner,
                                repo: session.repoName,
                                number: session.resolvedIssueNumber
                            ))
                        } else {
                            navigationPath.append(PRDestination(
                                owner: session.owner,
                                repo: session.repoName,
                                number: session.targetNumber
                            ))
                        }
                    },
                    onViewDiagnostics: {
                        sessionControlsTarget = nil
                        diagnosticsTarget = session.activeDeployment
                    },
                    onViewAutomationActivity: {
                        sessionControlsTarget = nil
                        automationActivityTarget = makeAutomationActivityTarget(
                            repoId: session.repoId,
                            targetType: session.targetType,
                            targetNumber: session.targetNumber
                        )
                    },
                    onEnd: {
                        Task {
                            await endSession(session)
                            sessionControlsTarget = nil
                        }
                    }
                )
                .presentationDetents([.height(455), .medium])
                .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showAutomationFeed) {
                NavigationStack {
                    AutomationFeedView()
                        .toolbar {
                            ToolbarItem(placement: .topBarLeading) {
                                Button("Done") {
                                    showAutomationFeed = false
                                }
                            }
                        }
                }
            }
            .sheet(item: $automationActivityTarget) { target in
                NavigationStack {
                    RepoAutomationActivityView(repo: target.repo, initialQuery: target.query)
                        .toolbar {
                            ToolbarItem(placement: .topBarLeading) {
                                Button("Done") {
                                    automationActivityTarget = nil
                                }
                            }
                        }
                }
            }
            .sheet(item: $ptyBridgeHandoffTarget) { session in
                PTYBridgeHandoffSheet(session: session)
                    .presentationDetents([.medium])
                    .presentationDragIndicator(.visible)
            }
            .sheet(item: $diagnosticsTarget) { deployment in
                DeploymentDiagnosticsSheet(deployment: deployment)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
            .sheet(item: $reviewDetailTarget) { target in
                ReviewRunDetailSheet(reviewId: target.id)
                    .presentationDetents([.large])
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
                    selectedRepoSummary: selectedRepoSummary,
                    selectedState: $selectedState,
                    selectedTrigger: $selectedTrigger,
                    selectedReviewStatus: $selectedReviewStatus,
                    selectedTab: selectedTab
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
        }
    }

    private var overviewContent: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if let actionError {
                    Label(actionError, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                        .font(.subheadline)
                        .lineLimit(3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                switch selectedTab {
                case .sessions:
                    if filteredSessionGroups.isEmpty {
                        emptyFilteredState
                    } else {
                        ForEach(filteredSessionGroups) { group in
                            SessionTargetGroupView(
                                group: group,
                                endingDeploymentId: endingDeploymentId,
                                onOpen: openTerminal,
                                onWebWorkbench: { ptyBridgeHandoffTarget = $0 },
                                onControls: { sessionControlsTarget = $0 }
                            )
                        }
                    }
                case .reviews:
                    if filteredReviewGroups.isEmpty {
                        emptyFilteredState
                    } else {
                        ForEach(filteredReviewGroups) { group in
                            ReviewRunGroupView(
                                group: group,
                                onOpenDeployment: openTerminal,
                                onOpenPullRequest: { run in
                                    navigationPath.append(PRDestination(owner: run.owner, repo: run.repoName, number: run.prNumber))
                                },
                                onOpenDiagnostics: { run in
                                    if let deployment = run.deployment {
                                        diagnosticsTarget = deployment.activeDeployment
                                    }
                                },
                                onOpenAutomationActivity: { run in
                                    automationActivityTarget = makeAutomationActivityTarget(
                                        repoId: run.repoId,
                                        targetType: .pr,
                                        targetNumber: run.prNumber
                                    )
                                },
                                onOpenDetail: { run in
                                    reviewDetailTarget = ReviewRunDetailTarget(id: run.id)
                                }
                            )
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }

    private var emptyFilteredState: some View {
        ContentUnavailableView {
            Label("No Matches", systemImage: "magnifyingglass")
        } description: {
            Text(selectedTab == .sessions ? "Try another repo, state, trigger, target, branch, or port." : "Try another repo, review status, trigger, or PR number.")
        } actions: {
            Button(hasActiveFilters ? "Clear Filters" : "Clear Search", action: resetFiltersAndSearch)
        }
        .padding(.top, 18)
    }

    private var sessionHeader: some View {
        AppTopBar(title: "Sessions", subtitle: sessionSubtitle) {
            HStack(spacing: 8) {
                TopBarIconButton(
                    title: "Automation Feed",
                    systemImage: "dot.radiowaves.left.and.right",
                    accessibilityIdentifier: "sessions-automation-feed-button"
                ) {
                    showAutomationFeed = true
                }

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
        guard let summary = overview?.summary else {
            return "No active sessions"
        }

        switch selectedTab {
        case .sessions:
            if summary.activeSessions == 0 && summary.endedSessions == 0 {
                return "No sessions"
            }
            if summary.activeSessions > 0 && summary.endedSessions == 0 {
                return "Running sessions"
            }
            return "\(summary.activeSessions) active · \(summary.endedSessions) ended"
        case .reviews:
            if summary.reviewRuns == 0 {
                return "No review runs"
            }
            return "\(summary.reviewRuns) reviews · \(summary.activeReviewRuns) active"
        }
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

    private func sessionGroupSort(_ left: SessionsOverviewSessionGroup, _ right: SessionsOverviewSessionGroup) -> Bool {
        let leftRank = left.sessions.map(sessionSortRank).min() ?? Int.max
        let rightRank = right.sessions.map(sessionSortRank).min() ?? Int.max
        if leftRank != rightRank {
            return leftRank < rightRank
        }
        return left.key < right.key
    }

    private func sessionSortRank(_ session: SessionsOverviewSession) -> Int {
        if !session.isActive {
            return 4
        }
        switch session.preview?.status {
        case .idle:
            return 0
        case .error:
            return 1
        case .active:
            return 2
        case .unavailable, nil:
            return 3
        }
    }

    private func hideSearch() {
        searchText = ""
        isSearchFocused = false
        isSearchVisible = false
    }

    private func resetFiltersAndSearch() {
        selectedRepoIds.removeAll()
        selectedState = .all
        selectedTrigger = .all
        selectedReviewStatus = .all
        hideSearch()
    }

    private func sessionErrorDescription(_ message: String) -> String {
        "\(message)\n\nRetry after starting issuectl web, or open Settings to update the server."
    }

    private func openTerminal(_ session: SessionsOverviewSession) {
        guard session.isActive else { return }
        openTerminal(session.activeDeployment)
    }

    private func openTerminal(_ deployment: ActiveDeployment) {
        guard deployment.canOpenTerminalInApp else { return }
        terminalPresentation = TerminalPresentation(deployment: deployment)
    }

    private func load(refresh: Bool = false, includeRepos: Bool? = nil) async {
        let shouldLoadRepos = includeRepos ?? (refresh || repos.isEmpty)
        let trace = PerformanceTrace.begin("sessions.load", metadata: "refresh=\(refresh) include_repos=\(shouldLoadRepos)")
        if overviewResponse == nil { isLoading = true }
        errorMessage = nil
        if refresh { actionError = nil }
        defer {
            PerformanceTrace.end(trace, metadata: "session_groups=\(overview?.sessionGroups.count ?? 0) review_groups=\(overview?.reviewGroups.count ?? 0) repos=\(repos.count)")
        }
        do {
            async let overviewResult = api.sessionsOverview(
                tab: selectedTab,
                searchText: searchText,
                repo: selectedRepoQuery,
                trigger: selectedTrigger,
                state: selectedState,
                status: selectedReviewStatus
            )
            async let reposResult: Result<[Repo], Error>? = shouldLoadRepos ? {
                do { return .success(try await api.repos()) }
                catch { return .failure(error) }
            }() : nil
            overviewResponse = try await overviewResult
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
            if overviewResponse == nil {
                errorMessage = error.localizedDescription
            } else {
                actionError = error.localizedDescription
            }
        }
        isLoading = false
        applyPendingRoute()
    }

    private func refreshSessions() async {
        await load(refresh: true)
    }

    private func streamSessionUpdates() async {
        while !Task.isCancelled {
            let task: URLSessionWebSocketTask
            do {
                task = try api.webhookEventsStreamTask()
                task.resume()
                defer { task.cancel(with: .goingAway, reason: nil) }
                while !Task.isCancelled {
                    _ = try await task.receive()
                    guard terminalPresentation == nil else { continue }
                    await load(includeRepos: false)
                }
            } catch {
                try? await Task.sleep(for: .seconds(5))
            }
        }
    }

    private func endSession(_ session: SessionsOverviewSession) async {
        endingDeploymentId = session.id
        do {
            _ = try await api.endSession(
                deploymentId: session.id,
                owner: session.owner,
                repo: session.repoName,
                issueNumber: session.resolvedIssueNumber,
                targetType: session.targetType,
                targetNumber: session.targetNumber
            )
            await load(refresh: true, includeRepos: false)
        } catch {
            actionError = error.localizedDescription
        }
        endingDeploymentId = nil
    }

    private func makeAutomationActivityTarget(
        repoId: Int,
        targetType: DeploymentTargetType,
        targetNumber: Int
    ) -> RepoAutomationActivityTarget? {
        guard let repo = repos.first(where: { $0.id == repoId }) else { return nil }
        var query = RepoAutomationActivityQuery()
        query.scope = targetType == .pr ? .pullRequests : .issues
        query.numberText = "\(targetNumber)"
        return RepoAutomationActivityTarget(repo: repo, query: query)
    }

    private func applyPendingRoute() {
        guard let route else { return }
        switch route {
        case .sessions(let repoFullName, let deploymentId):
            selectedTab = .sessions
            applyRepoFilter(repoFullName)
            if let deploymentId,
               let session = overview?.sessionGroups.flatMap(\.sessions).first(where: { $0.id == deploymentId }) {
                sessionControlsTarget = session
            }
            self.route = nil
        case .review(let id):
            selectedTab = .reviews
            if let reviewId = Int(id) {
                if let run = overview?.reviewGroups.flatMap(\.runs).first(where: { $0.id == reviewId }),
                   let repo = repos.first(where: { $0.id == run.repoId }) {
                    selectedRepoIds = [repo.id]
                }
                reviewDetailTarget = ReviewRunDetailTarget(id: reviewId)
            }
            self.route = nil
        case .issue, .pullRequest, .board:
            break
        }
    }

    private func applyRepoFilter(_ repoFullName: String?) {
        guard let repoFullName,
              let repo = repos.first(where: { $0.fullName == repoFullName }) else {
            return
        }
        selectedRepoIds = [repo.id]
    }
}

private struct TerminalPresentation: Identifiable {
    let id = UUID()
    let deployment: ActiveDeployment
}

private struct RepoAutomationActivityTarget: Identifiable {
    let id = UUID()
    let repo: Repo
    let query: RepoAutomationActivityQuery
}

private struct PTYBridgeHandoffSheet: View {
    let session: SessionsOverviewSession
    @State private var didCopy = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Label("PTY bridge terminal", systemImage: "network")
                    .font(.headline)

                Text("This session uses the web workbench terminal bridge. Native ttyd terminal attachment is not available for this backend.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                VStack(alignment: .leading, spacing: 6) {
                    Text("Web workbench path")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text(session.webWorkbenchPath)
                        .font(.caption.monospaced())
                        .textSelection(.enabled)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
                }

                Button {
                    UIPasteboard.general.string = session.webWorkbenchPath
                    didCopy = true
                } label: {
                    Label(didCopy ? "Copied" : "Copy Web Workbench Path", systemImage: didCopy ? "checkmark.circle.fill" : "doc.on.doc")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("pty-bridge-copy-workbench-path")

                Spacer(minLength: 0)
            }
            .padding(16)
            .navigationTitle("Web Workbench")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct SessionTargetGroupView: View {
    let group: SessionsOverviewSessionGroup
    let endingDeploymentId: Int?
    let onOpen: (SessionsOverviewSession) -> Void
    let onWebWorkbench: (SessionsOverviewSession) -> Void
    let onControls: (SessionsOverviewSession) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            groupHeader
            ForEach(group.sessions) { session in
                SessionOverviewRow(
                    session: session,
                    isEnding: endingDeploymentId == session.id,
                    onOpen: { onOpen(session) },
                    onWebWorkbench: { onWebWorkbench(session) },
                    onControls: { onControls(session) }
                )
            }
        }
    }

    private var groupHeader: some View {
        HStack(spacing: 8) {
            Label(group.targetLabel, systemImage: group.targetType == .issue ? "number" : "arrow.triangle.merge")
                .font(.subheadline.weight(.semibold))
            Spacer(minLength: 8)
            Text(group.repoFullName)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.horizontal, 2)
    }
}

private struct SessionOverviewRow: View {
    let session: SessionsOverviewSession
    let isEnding: Bool
    let onOpen: () -> Void
    let onWebWorkbench: () -> Void
    let onControls: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 8, height: 8)
                Text(session.repoFullName)
                    .font(.subheadline.weight(.medium))
                Text(session.targetLabel)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 8)
                Text(statusText)
                    .font(.caption.bold())
                    .foregroundStyle(statusColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(statusColor.opacity(0.14), in: Capsule())
            }

            Label(session.branchName, systemImage: "arrow.triangle.branch")
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
                .lineLimit(1)

            VStack(alignment: .leading, spacing: 4) {
                Label(session.sessionRoleTitle, systemImage: session.isIssueTarget ? "number" : "arrow.triangle.merge")
                    .font(.caption.weight(.semibold))
                Text(session.provenanceSummary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            HStack(spacing: 10) {
                sessionMetric(value: session.durationLabel, label: session.isActive ? "Duration" : "Elapsed", systemImage: "clock")
                sessionMetric(value: session.terminalMetricValue, label: "Terminal", systemImage: "terminal")
            }

            HStack(spacing: 8) {
                Button(action: primaryAction) {
                    Label(openButtonTitle, systemImage: primaryButtonImage)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background(IssueCTLColors.action.opacity(canUsePrimaryAction ? 1 : 0.45), in: RoundedRectangle(cornerRadius: 12))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(!canUsePrimaryAction || isEnding)
                .accessibilityIdentifier(primaryButtonIdentifier)

                Button(action: onControls) {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(width: 44, height: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.bordered)
                .disabled(isEnding)
                .accessibilityLabel("Session controls")
                .accessibilityIdentifier("session-controls-\(session.id)")
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .stroke(statusColor.opacity(0.34), lineWidth: 1)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if canOpenTerminal {
                onOpen()
            } else if canOpenWebWorkbench {
                onWebWorkbench()
            }
        }
    }

    private var canOpenTerminal: Bool {
        session.canOpenTerminalInApp
    }

    private var openButtonTitle: String {
        if !session.isActive { return "Session Ended" }
        if session.ttydPort != nil { return "Open Terminal" }
        return session.usesPtyBridgeTerminal ? "Open Web Workbench" : "Starting..."
    }

    private var primaryButtonImage: String {
        session.usesPtyBridgeTerminal ? "safari" : "terminal"
    }

    private var primaryButtonIdentifier: String {
        if canOpenWebWorkbench {
            return "session-web-workbench-\(session.id)"
        }
        return "session-reenter-terminal-\(session.id)"
    }

    private var canOpenWebWorkbench: Bool {
        session.isActive && session.usesPtyBridgeTerminal
    }

    private var canUsePrimaryAction: Bool {
        canOpenTerminal || canOpenWebWorkbench
    }

    private func primaryAction() {
        if canOpenTerminal {
            onOpen()
        } else if canOpenWebWorkbench {
            onWebWorkbench()
        }
    }

    private var statusColor: Color {
        if !session.isActive { return Color.secondary }
        switch session.preview?.status {
        case .active: return Color.green
        case .idle: return Color.orange
        case .error: return Color.red
        case .unavailable: return Color.secondary
        case nil: return session.usesPtyBridgeTerminal ? Color.green : (session.ttydPort == nil ? Color.orange : Color.secondary)
        }
    }

    private var statusText: String {
        if !session.isActive { return "Ended" }
        guard session.ttydPort != nil else { return session.usesPtyBridgeTerminal ? "PTY bridge" : "Starting" }
        switch session.preview?.status {
        case .idle: return "Idle"
        case .error: return "Error"
        case .unavailable: return "Checking"
        case .active: return "Running"
        case nil: return "Checking"
        }
    }

    private func sessionMetric(value: String, label: String, systemImage: String) -> some View {
        HStack(spacing: 7) {
            Image(systemName: systemImage)
                .font(.caption)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 1) {
                Text(value.isEmpty ? "-" : value)
                    .font(.subheadline.bold())
                    .lineLimit(1)
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct ReviewRunGroupView: View {
    let group: SessionsOverviewReviewGroup
    let onOpenDeployment: (SessionsOverviewSession) -> Void
    let onOpenPullRequest: (SessionsOverviewReviewRun) -> Void
    let onOpenDiagnostics: (SessionsOverviewReviewRun) -> Void
    let onOpenAutomationActivity: (SessionsOverviewReviewRun) -> Void
    let onOpenDetail: (SessionsOverviewReviewRun) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Label("PR #\(group.prNumber)", systemImage: "eye")
                    .font(.subheadline.weight(.semibold))
                Spacer(minLength: 8)
                Text(group.repoFullName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 2)

            ForEach(group.runs) { run in
                ReviewRunRow(
                    run: run,
                    onOpenDeployment: { deployment in onOpenDeployment(deployment) },
                    onOpenPullRequest: { onOpenPullRequest(run) },
                    onOpenDiagnostics: { onOpenDiagnostics(run) },
                    onOpenAutomationActivity: { onOpenAutomationActivity(run) },
                    onOpenDetail: { onOpenDetail(run) }
                )
            }
        }
        .accessibilityIdentifier("review-group-\(group.key)")
    }
}

private struct ReviewRunRow: View {
    let run: SessionsOverviewReviewRun
    let onOpenDeployment: (SessionsOverviewSession) -> Void
    let onOpenPullRequest: () -> Void
    let onOpenDiagnostics: () -> Void
    let onOpenAutomationActivity: () -> Void
    let onOpenDetail: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text(run.statusLabel)
                    .font(.caption.bold())
                    .foregroundStyle(statusColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(statusColor.opacity(0.14), in: Capsule())
                Text(run.triggeredBy.displayName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(run.elapsedLabel ?? "")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(run.summary ?? "No review summary recorded.")
                    .font(.subheadline)
                    .lineLimit(3)
                Text(run.status.operatorDescription)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(run.rangeLabel) · \(run.headRepoFullName):\(run.headRef)")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            HStack(spacing: 8) {
                if let count = run.findingCount {
                    reviewMetric(value: "\(count)", label: "Findings", systemImage: "exclamationmark.bubble")
                }
                if let deployment = run.deployment {
                    reviewMetric(value: "#\(deployment.id)", label: "Session", systemImage: "terminal")
                }
            }

            HStack(spacing: 8) {
                Button(action: onOpenDetail) {
                    Label("Details", systemImage: "list.bullet.rectangle")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 38)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("review-detail-\(run.id)")

                Button(action: onOpenPullRequest) {
                    Image(systemName: "arrow.triangle.merge")
                        .frame(width: 42, height: 38)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Open PR")
                .accessibilityIdentifier("review-open-pr-\(run.id)")

                Button(action: onOpenAutomationActivity) {
                    Image(systemName: "dot.radiowaves.left.and.right")
                        .frame(width: 42, height: 38)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Open review automation activity")
                .accessibilityIdentifier("review-automation-activity-\(run.id)")

                if let deployment = run.deployment, deployment.canOpenTerminalInApp {
                    Button {
                        onOpenDeployment(deployment)
                    } label: {
                        Image(systemName: "terminal")
                            .frame(width: 42, height: 38)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityLabel("Open review terminal")
                    .accessibilityIdentifier("review-open-terminal-\(run.id)")
                }

                if run.deployment != nil {
                    Button(action: onOpenDiagnostics) {
                        Image(systemName: "waveform.path.ecg")
                            .frame(width: 42, height: 38)
                    }
                    .buttonStyle(.bordered)
                    .accessibilityLabel("Open review diagnostics")
                    .accessibilityIdentifier("review-diagnostics-\(run.id)")
                }
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(statusColor.opacity(0.24), lineWidth: 1)
        }
    }

    private var statusColor: Color {
        switch run.status {
        case .completed: Color.green
        case .failed: Color.red
        case .superseded: Color.secondary
        case .reserved, .launching, .inProgress: Color.orange
        }
    }

    private func reviewMetric(value: String, label: String, systemImage: String) -> some View {
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
        .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct SessionFilterSheet: View {
    let repos: [Repo]
    @Binding var selectedRepoIds: Set<Int>
    let selectedRepoSummary: String
    @Binding var selectedState: SessionsOverviewStateFilter
    @Binding var selectedTrigger: SessionsOverviewTriggerFilter
    @Binding var selectedReviewStatus: ReviewRunStatusFilter
    let selectedTab: SessionsOverviewTab

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

                    VStack(alignment: .leading, spacing: 10) {
                        Label("Session State", systemImage: "circle.dashed")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Picker("Session state", selection: $selectedState) {
                            ForEach(SessionsOverviewStateFilter.allCases) { state in
                                Text(state.displayName).tag(state)
                            }
                        }
                        .pickerStyle(.segmented)
                    }
                    .padding(12)
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))

                    VStack(alignment: .leading, spacing: 10) {
                        Label("Trigger", systemImage: "bolt")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Picker("Trigger", selection: $selectedTrigger) {
                            ForEach(SessionsOverviewTriggerFilter.allCases) { trigger in
                                Text(trigger.displayName).tag(trigger)
                            }
                        }
                        .pickerStyle(.segmented)
                    }
                    .padding(12)
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))

                    if selectedTab == .reviews {
                        VStack(alignment: .leading, spacing: 10) {
                            Label("Review Status", systemImage: "checklist")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            Picker("Review status", selection: $selectedReviewStatus) {
                                ForEach(ReviewRunStatusFilter.allCases) { status in
                                    Text(status.displayName).tag(status)
                                }
                            }
                            .pickerStyle(.menu)
                        }
                        .padding(12)
                        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
                    }
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
            if !selectedRepoIds.isEmpty || selectedState != .all || selectedTrigger != .all || selectedReviewStatus != .all {
                Button("Reset") {
                    selectedRepoIds.removeAll()
                    selectedState = .all
                    selectedTrigger = .all
                    selectedReviewStatus = .all
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
    let session: SessionsOverviewSession
    let isEnding: Bool
    let onOpenTerminal: () -> Void
    let onViewTarget: () -> Void
    let onViewDiagnostics: () -> Void
    let onViewAutomationActivity: () -> Void
    let onEnd: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text(session.sessionRoleTitle)
                    .font(.title2.weight(.bold))
                Text(session.repoTitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(session.provenanceSummary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 0) {
                sheetAction(
                    title: "Open Terminal",
                    subtitle: session.terminalActionSubtitle,
                    systemImage: "terminal",
                    accessibilityIdentifier: "session-open-terminal-\(session.id)",
                    isDisabled: !session.canOpenTerminalInApp,
                    action: onOpenTerminal
                )

                Divider()

                sheetAction(
                    title: session.isIssueTarget ? "View Issue" : "View Pull Request",
                    subtitle: session.isIssueTarget
                        ? "Jump to #\(session.resolvedIssueNumber) without losing this session."
                        : "Open PR #\(session.targetNumber) without losing this session.",
                    systemImage: session.isIssueTarget ? "number" : "arrow.triangle.merge",
                    accessibilityIdentifier: "session-target-action-\(session.id)",
                    action: onViewTarget
                )

                Divider()

                sheetAction(
                    title: "Automation Activity",
                    subtitle: "Open webhook events and review runs for this target.",
                    systemImage: "dot.radiowaves.left.and.right",
                    accessibilityIdentifier: "session-automation-activity-\(session.id)",
                    action: onViewAutomationActivity
                )

                Divider()

                sheetAction(
                    title: "View Diagnostics",
                    subtitle: "Browse launch and session lifecycle events.",
                    systemImage: "waveform.path.ecg",
                    accessibilityIdentifier: "session-diagnostics-\(session.id)",
                    action: onViewDiagnostics
                )

                if session.isActive {
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
                    .accessibilityIdentifier("session-end-\(session.id)")
                }
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
        accessibilityIdentifier: String,
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
        .accessibilityIdentifier(accessibilityIdentifier)
    }
}

private struct DeploymentDiagnosticsSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss

    let deployment: ActiveDeployment

    @State private var response: DeploymentDiagnosticsResponse?
    @State private var isLoading = true
    @State private var errorMessage: String?

    init(deployment: ActiveDeployment, initialResponse: DeploymentDiagnosticsResponse? = nil) {
        self.deployment = deployment
        _response = State(initialValue: initialResponse)
        _isLoading = State(initialValue: initialResponse == nil)
    }

    private var diagnosticsCommand: String {
        "pnpm --dir packages/cli exec issuectl diag show --deployment \(deployment.id)"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    header

                    if isLoading && response == nil {
                        ProgressView("Loading diagnostics...")
                            .frame(maxWidth: .infinity, minHeight: 160)
                    } else if let errorMessage, response == nil {
                        unavailableState(errorMessage)
                    } else if let response {
                        diagnosticsContent(response)
                    }
                }
                .padding(16)
            }
            .navigationTitle("Diagnostics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .task(id: deployment.id) {
                await load()
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Label(deployment.targetLabel, systemImage: deployment.isIssueTarget ? "number" : "arrow.triangle.merge")
                    .font(.headline)
                Spacer(minLength: 8)
                Text("Deployment #\(deployment.id)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            Text(deployment.repoFullName)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 6) {
                Text("CLI fallback")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(diagnosticsCommand)
                    .font(.caption.monospaced())
                    .textSelection(.enabled)
                    .lineLimit(3)
                    .accessibilityIdentifier("deployment-diagnostics-command-\(deployment.id)")
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private func diagnosticsContent(_ response: DeploymentDiagnosticsResponse) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if response.fromCache {
                OfflineStatusBanner(message: staleDataMessage(kind: "diagnostics", cachedAt: response.cachedAt.flatMap(parseIssueCTLDate)))
            }

            DeploymentDiagnosticsSummaryCard(response: response)

            if let filters = response.filters {
                DeploymentDiagnosticsFiltersCard(filters: filters)
            }

            if response.events.isEmpty {
                ContentUnavailableView {
                    Label("No Events", systemImage: "list.bullet.rectangle")
                } description: {
                    Text("No launch or session diagnostics have been recorded for this deployment yet.")
                }
                .frame(maxWidth: .infinity, minHeight: 160)
            } else {
                LazyVStack(alignment: .leading, spacing: 10) {
                    ForEach(response.events) { event in
                        DiagnosticEventCard(event: event)
                    }
                }
            }

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .lineLimit(4)
            }
        }
    }

    private func unavailableState(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            ContentUnavailableView {
                Label("Diagnostics Unavailable", systemImage: "waveform.path.ecg")
            } description: {
                Text(message)
            } actions: {
                Button("Retry") {
                    Task { await load() }
                }
            }
            .frame(maxWidth: .infinity, minHeight: 220)

            Text(mobileDiagnosticsDependencyMessage)
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    @MainActor
    private func load() async {
        guard response == nil else { return }
        isLoading = true
        errorMessage = nil
        do {
            response = try await api.deploymentDiagnostics(deploymentId: deployment.id)
        } catch {
            errorMessage = diagnosticsErrorMessage(error)
        }
        isLoading = false
    }
}

private struct DeploymentDiagnosticsSummaryCard: View {
    let response: DeploymentDiagnosticsResponse

    private let columns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: response.hasFailure ? "exclamationmark.triangle" : "checkmark.circle")
                    .foregroundStyle(response.hasFailure ? Color.orange : Color.green)
                Text(response.summaryText)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)
                Spacer(minLength: 0)
            }

            LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
                ForEach(Array(response.summaryRows.enumerated()), id: \.offset) { row in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.element.0)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(row.element.1)
                            .font(.caption.monospaced())
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                    .frame(maxWidth: .infinity, minHeight: 34, alignment: .leading)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10))
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        .accessibilityIdentifier("deployment-diagnostics-summary")
    }
}

private struct DeploymentDiagnosticsFiltersCard: View {
    let filters: DiagnosticFilters

    var body: some View {
        HStack(spacing: 10) {
            Label("Request", systemImage: "line.3.horizontal.decrease.circle")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            Spacer(minLength: 8)

            Text(filters.targetDescription)
                .font(.caption.monospaced())
                .lineLimit(1)
                .minimumScaleFactor(0.75)

            Text(filters.limitDescription)
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityIdentifier("deployment-diagnostics-filters")
    }
}

private struct DiagnosticEventCard: View {
    let event: DiagnosticEvent

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: event.level.systemImage)
                    .foregroundStyle(levelColor)
                    .frame(width: 22)

                VStack(alignment: .leading, spacing: 3) {
                    Text(event.event)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(2)
                    Text(eventContextText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 8)

                Text(event.level.displayName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(levelColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(levelColor.opacity(0.14), in: Capsule())
            }

            if let message = event.message, !message.isEmpty {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !event.metadataRows.isEmpty {
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(Array(event.metadataRows.enumerated()), id: \.offset) { row in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(row.element.0)
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                                .frame(width: 92, alignment: .leading)
                            Text(row.element.1)
                                .font(.caption.monospaced())
                                .foregroundStyle(.primary)
                                .lineLimit(3)
                            Spacer(minLength: 0)
                        }
                    }
                }
                .padding(10)
                .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10))
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(levelColor.opacity(event.isFailure ? 0.45 : 0.16), lineWidth: 1)
        }
        .accessibilityIdentifier("diagnostic-event-\(event.id)")
    }

    private var levelColor: Color {
        switch event.level {
        case .debug: Color.secondary
        case .info: IssueCTLColors.action
        case .warn: Color.orange
        case .error: Color.red
        }
    }

    private var eventContextText: String {
        [
            event.timeText,
            event.source,
            event.targetLabel,
        ]
        .compactMap { value in
            guard let value, !value.isEmpty else { return nil }
            return value
        }
        .joined(separator: " - ")
    }
}

private let mobileDiagnosticsDependencyMessage = "Live mobile diagnostics require the structured /api/v1/diagnostics/deployments/:id endpoint from issue #546. This iOS browser is wired for that JSON API and does not scrape dashboard HTML."

private func diagnosticsErrorMessage(_ error: Error) -> String {
    if case APIError.serverError(let code, _) = error, code == 404 {
        return "The connected issuectl server does not expose the mobile diagnostics endpoint yet."
    }
    return error.localizedDescription
}
