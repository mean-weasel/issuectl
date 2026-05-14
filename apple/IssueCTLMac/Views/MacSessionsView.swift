import SwiftUI

struct MacSessionsView: View {
    @Environment(APIClient.self) private var api
    @Environment(\.openURL) private var openURL
    @Environment(\.macSidebarTextScale) private var textScale

    let store: MacSidebarStore

    @State private var endingSessionId: Int?
    @State private var errorMessage: String?
    @State private var terminalNotice: String?
    @State private var searchText = ""
    @State private var selectedRepoKeys: Set<String> = []
    @State private var isRepoFilterExpanded = true
    @State private var hasSyncedRepoSelection = false
    @State private var selectedIssue: MacIssueListItem?

    private var availableRepoKeys: [String] {
        MacSessionListProjection.repoKeys(for: store.sessions)
    }

    private var projection: MacSessionListProjection {
        MacSessionListProjection.project(
            sessions: store.sessions,
            previewsByPort: store.sessionPreviewsByPort,
            selectedRepoKeys: selectedRepoKeys,
            searchText: searchText
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            controls

            if store.isLoading && store.sessions.isEmpty {
                ProgressView("Loading sessions...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.sessions.isEmpty {
                ContentUnavailableView("No Active Sessions", systemImage: "terminal", description: Text("Launch an issue to start an agent session."))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if projection.sessions.isEmpty {
                ContentUnavailableView("No Matching Sessions", systemImage: "line.3.horizontal.decrease.circle", description: Text("Adjust search or repository filters."))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(projection.sessions) { session in
                    sessionRow(session)
                        .accessibilityIdentifier("mac-session-row-\(session.id)")
                }
                .listStyle(.plain)
            }
        }
        .onAppear { syncRepoSelection() }
        .onChange(of: store.sessions.count) { _, _ in syncRepoSelection() }
        .task {
            await pollSessions()
        }
        .sheet(item: $selectedIssue) { item in
            MacIssueDetailView(item: item, store: store)
        }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Search sessions", text: $searchText)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("mac-sessions-search-field")

            HStack {
                Text(resultSummary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("mac-sessions-result-summary")
                Spacer()
                Button {
                    Task { await store.refreshSessions(api: api) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.borderless)
                .help("Refresh sessions")
                .accessibilityIdentifier("mac-sessions-refresh-button")
            }

            DisclosureGroup(isExpanded: $isRepoFilterExpanded) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Button("All") {
                            selectedRepoKeys = Set(availableRepoKeys)
                        }
                        .controlSize(.small)
                        .accessibilityIdentifier("mac-sessions-repo-filter-all")

                        Button("None") {
                            selectedRepoKeys = []
                        }
                        .controlSize(.small)
                        .accessibilityIdentifier("mac-sessions-repo-filter-none")

                        Spacer()
                    }

                    ForEach(availableRepoKeys, id: \.self) { repoKey in
                        Toggle(repoKey, isOn: repoBinding(repoKey))
                            .toggleStyle(.checkbox)
                            .font(.macSidebar(size: 12, scale: textScale))
                            .accessibilityIdentifier("mac-sessions-repo-filter-\(repoKey)")
                    }
                }
                .padding(.top, 4)
            } label: {
                HStack {
                    Text("Repositories")
                        .font(.macSidebar(size: 11, weight: .semibold, scale: textScale))
                    Spacer()
                    Text(repoFilterSummary)
                        .font(.macSidebar(size: 11, scale: textScale))
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityIdentifier("mac-sessions-repo-disclosure")

            HStack(spacing: 6) {
                Label(repoFilterSummary, systemImage: "folder")
                if !searchText.isEmpty {
                    Label("Search", systemImage: "magnifyingglass")
                }
            }
            .font(.macSidebar(size: 11, scale: textScale))
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .accessibilityIdentifier("mac-sessions-filter-summary")

            if store.sessionsFromCache {
                Label("Showing cached sessions", systemImage: "externaldrive.badge.clock")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("mac-sessions-cache-banner")
            }

            if let sessionPreviewError = store.sessionPreviewError {
                Label("Terminal previews unavailable: \(sessionPreviewError)", systemImage: "terminal.fill")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("mac-sessions-preview-error")
            }

            if let errorMessage {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Label(errorMessage, systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .fixedSize(horizontal: false, vertical: true)

                    Spacer(minLength: 8)

                    Button("Retry Refresh") {
                        Task { await retryRefresh() }
                    }
                    .controlSize(.small)
                }
                .accessibilityIdentifier("mac-sessions-error")
            }

            if let terminalNotice {
                Label(terminalNotice, systemImage: "terminal")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("mac-sessions-terminal-notice")
            }
        }
        .padding(12)
    }

    private func sessionRow(_ session: ActiveDeployment) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(session.repoFullName) #\(session.issueNumber)")
                        .font(.subheadline.weight(.medium))
                    Text(session.branchName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Text(session.runningDuration)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if !session.workspacePath.isEmpty {
                Text(session.workspacePath)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }

            HStack(spacing: 8) {
                Label(session.ttydPort == nil ? "Starting" : "Ready", systemImage: session.ttydPort == nil ? "hourglass" : "terminal")
                    .font(.caption)
                    .foregroundStyle(session.ttydPort == nil ? .orange : .green)

                Spacer()

                Button {
                    selectedIssue = issueItem(for: session)
                } label: {
                    Label("Issue", systemImage: "number")
                }
                .buttonStyle(.bordered)
                .disabled(issueItem(for: session) == nil)
                .accessibilityLabel("View issue for session \(session.id)")
                .accessibilityIdentifier("mac-session-view-issue-\(session.id)")

                Button {
                    openTerminal(session)
                } label: {
                    Label("Open", systemImage: "terminal")
                }
                .buttonStyle(.bordered)
                .disabled(session.ttydPort == nil)
                .accessibilityLabel("Open terminal for session \(session.id)")
                .accessibilityIdentifier("mac-session-open-terminal-\(session.id)")

                Button(role: .destructive) {
                    Task { await endSession(session) }
                } label: {
                    if endingSessionId == session.id {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label("End", systemImage: "stop.circle")
                    }
                }
                .buttonStyle(.bordered)
                .disabled(endingSessionId != nil)
                .accessibilityLabel("End session \(session.id)")
                .accessibilityIdentifier("mac-session-end-\(session.id)")
            }

            terminalPreview(for: session)
        }
        .padding(.vertical, 6)
    }

    private func terminalPreview(for session: ActiveDeployment) -> some View {
        let preview = preview(for: session)
        return VStack(alignment: .leading, spacing: 3) {
            if let preview {
                HStack(spacing: 6) {
                    Text(preview.status.displayName)
                        .font(.caption2.weight(.semibold))
                    if let latestLine = preview.latestLine {
                        Text(latestLine)
                            .font(.caption2.monospaced())
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            } else {
                Text(session.ttydPort == nil ? "Terminal preparing" : "Preview unavailable")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityIdentifier("mac-session-preview-\(session.id)")
    }

    private func openTerminal(_ session: ActiveDeployment) {
        Task {
            errorMessage = nil
            terminalNotice = nil
            do {
                let access = try await store.terminalAccess(api: api, session: session)
                if ProcessInfo.processInfo.environment["ISSUECTL_UI_TESTING"] != "1" {
                    openURL(access.url)
                }
                terminalNotice = access.respawned ? "Terminal respawned on port \(access.port)" : "Terminal opened on port \(access.port)"
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func endSession(_ session: ActiveDeployment) async {
        endingSessionId = session.id
        errorMessage = nil
        defer { endingSessionId = nil }

        do {
            try await store.endSession(api: api, session: session)
            syncRepoSelection()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func retryRefresh() async {
        errorMessage = nil
        await store.refreshSessions(api: api)
        if let storeError = store.errorMessage {
            errorMessage = storeError
        }
    }

    private func pollSessions() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(15))
            guard !Task.isCancelled else { return }
            await store.refreshSessions(api: api)
        }
    }

    private func syncRepoSelection() {
        let repoKeys = availableRepoKeys
        if !hasSyncedRepoSelection {
            selectedRepoKeys = Set(repoKeys)
            hasSyncedRepoSelection = true
        } else {
            selectedRepoKeys.formIntersection(Set(repoKeys))
        }
    }

    private func repoBinding(_ repoKey: String) -> Binding<Bool> {
        Binding(
            get: { selectedRepoKeys.contains(repoKey) },
            set: { isSelected in
                if isSelected {
                    selectedRepoKeys.insert(repoKey)
                } else {
                    selectedRepoKeys.remove(repoKey)
                }
            }
        )
    }

    private func preview(for session: ActiveDeployment) -> SessionPreview? {
        guard let port = session.ttydPort else { return nil }
        return store.sessionPreviewsByPort[port]
    }

    private func issueItem(for session: ActiveDeployment) -> MacIssueListItem? {
        store.issues.first { item in
            item.repo.owner == session.owner &&
            item.repo.name == session.repoName &&
            item.issue.number == session.issueNumber
        }
    }

    private var resultSummary: String {
        "\(projection.sessions.count) of \(store.sessions.count) active"
    }

    private var repoFilterSummary: String {
        if availableRepoKeys.isEmpty {
            return "No repos"
        }
        if selectedRepoKeys.isEmpty {
            return "No repos selected"
        }
        if selectedRepoKeys.count == availableRepoKeys.count {
            return "All repos"
        }
        return "\(selectedRepoKeys.count) of \(availableRepoKeys.count) repos"
    }
}
