import SwiftUI
import AppKit
import WebKit

struct MacSessionsView: View {
    @Environment(APIClient.self) private var api
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
        errorMessage = nil
        terminalNotice = nil
        MacTerminalWindowController.open(session: session, store: store, api: api) {
            syncRepoSelection()
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

struct MacTerminalSessionSheet: View {
    @Environment(APIClient.self) private var api

    let session: ActiveDeployment
    let store: MacSidebarStore
    let onEnded: () -> Void
    let onClose: () -> Void

    @AppStorage("macTerminalFontSize") private var terminalFontSize = 14

    @State private var access: MacTerminalAccess?
    @State private var isLoading = false
    @State private var isEnding = false
    @State private var errorMessage: String?
    @State private var notice: String?

    private var preferences: MacTerminalPreferences {
        MacTerminalPreferences(fontSize: terminalFontSize, lineHeight: "1.25")
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            terminalBody
        }
        .frame(minWidth: 760, idealWidth: 960, minHeight: 520, idealHeight: 680)
        .task {
            if access == nil {
                await loadTerminal()
            }
        }
        .onChange(of: terminalFontSize) { _, _ in
            Task { await loadTerminal() }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("\(session.repoFullName) #\(session.issueNumber)")
                        .font(.headline)
                        .accessibilityIdentifier("mac-terminal-title")
                    Text(session.branchName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Label(session.runningDuration, systemImage: "clock")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("mac-terminal-duration")

                Button {
                    Task { await loadTerminal() }
                } label: {
                    Label("Reconnect", systemImage: "arrow.clockwise")
                }
                .disabled(isLoading || isEnding)
                .accessibilityIdentifier("mac-terminal-reconnect-button")

                Button(role: .destructive) {
                    Task { await endSession() }
                } label: {
                    if isEnding {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label("End", systemImage: "stop.circle")
                    }
                }
                .disabled(isEnding)
                .accessibilityIdentifier("mac-terminal-end-button")

                Button {
                    onClose()
                } label: {
                    Image(systemName: "xmark")
                }
                .buttonStyle(.borderless)
                .help("Close")
                .accessibilityIdentifier("mac-terminal-close-button")
            }

            HStack(spacing: 10) {
                Label(access.map { "Port \($0.port)" } ?? "Preparing terminal", systemImage: "terminal")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("mac-terminal-status")

                Spacer()

                Label("Text Size", systemImage: "textformat.size")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Stepper("\(terminalFontSize) pt", value: $terminalFontSize, in: 10...22, step: 1)
                    .labelsHidden()
                    .accessibilityLabel("Terminal text size")
                    .accessibilityValue("\(terminalFontSize) pt")
                    .accessibilityIdentifier("mac-terminal-text-size-stepper")
            }

            if let notice {
                Label(notice, systemImage: "checkmark.circle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("mac-terminal-notice")
            }

            if let errorMessage {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Label(errorMessage, systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("mac-terminal-error")

                    Button("Retry") {
                        Task { await loadTerminal() }
                    }
                    .controlSize(.small)
                    .disabled(isLoading)
                    .accessibilityIdentifier("mac-terminal-retry-button")
                }
            }
        }
        .padding(14)
    }

    @ViewBuilder
    private var terminalBody: some View {
        if isLoading && access == nil {
            ProgressView("Opening terminal...")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityIdentifier("mac-terminal-loading")
        } else if let access {
            MacTerminalWebView(url: access.url)
                .id(access.url)
                .accessibilityIdentifier("mac-terminal-webview")
        } else {
            ContentUnavailableView("Terminal Not Ready", systemImage: "terminal", description: Text("Reconnect when the session is ready."))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityIdentifier("mac-terminal-unavailable")
        }
    }

    @MainActor
    private func loadTerminal() async {
        isLoading = true
        errorMessage = nil
        notice = nil
        defer { isLoading = false }

        do {
            let nextAccess = try await store.terminalAccess(api: api, session: session, preferences: preferences)
            access = nextAccess
            notice = nextAccess.respawned ? "Terminal respawned on port \(nextAccess.port)" : "Terminal connected on port \(nextAccess.port)"
        } catch {
            access = nil
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func endSession() async {
        isEnding = true
        errorMessage = nil
        defer { isEnding = false }

        do {
            try await store.endSession(api: api, session: session)
            onEnded()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct MacTerminalWebView: NSViewRepresentable {
    let url: URL

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.suppressesIncrementalRendering = false
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsMagnification = true
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        if webView.url != url {
            webView.load(URLRequest(url: url))
        }
    }
}

@MainActor
final class MacTerminalWindowController: NSWindowController, NSWindowDelegate {
    private static var controllers: [Int: MacTerminalWindowController] = [:]

    private let sessionId: Int

    static func open(
        session: ActiveDeployment,
        store: MacSidebarStore,
        api: APIClient,
        onEnded: @escaping () -> Void
    ) {
        if let existing = controllers[session.id] {
            existing.showWindow(nil)
            existing.window?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let controller = MacTerminalWindowController(session: session, store: store, api: api, onEnded: onEnded)
        controllers[session.id] = controller
        controller.showWindow(nil)
        controller.window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private init(
        session: ActiveDeployment,
        store: MacSidebarStore,
        api: APIClient,
        onEnded: @escaping () -> Void
    ) {
        sessionId = session.id
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 960, height: 680),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "\(session.repoFullName) #\(session.issueNumber) Terminal"
        window.minSize = NSSize(width: 760, height: 520)
        window.center()

        super.init(window: window)
        window.delegate = self

        let content = MacTerminalSessionSheet(
            session: session,
            store: store,
            onEnded: { [weak self] in
                onEnded()
                self?.close()
            },
            onClose: { [weak self] in
                self?.close()
            }
        )
        window.contentView = NSHostingView(rootView: content.environment(api))
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func windowWillClose(_ notification: Notification) {
        Self.controllers[sessionId] = nil
    }
}
