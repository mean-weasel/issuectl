import SwiftUI

struct BoardView: View {
    @Environment(APIClient.self) private var api
    @State private var store = WorkbenchStore()
    @State private var navigationPath = NavigationPath()
    @State private var showRepoFilters = false

    let onShowSettings: () -> Void
    @Binding private var route: AppRoute?

    init(onShowSettings: @escaping () -> Void, route: Binding<AppRoute?> = .constant(nil)) {
        self.onShowSettings = onShowSettings
        self._route = route
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            VStack(spacing: 0) {
                AppTopBar(title: "Board", subtitle: store.headerSubtitle) {
                    HStack(spacing: 8) {
                        TopBarIconButton(
                            title: "Refresh board",
                            systemImage: store.isRefreshing ? "arrow.triangle.2.circlepath.circle" : "arrow.clockwise",
                            accessibilityIdentifier: "board-refresh-button"
                        ) {
                            Task { await store.load(api: api, refresh: true) }
                        }

                        TopBarIconButton(
                            title: "Board filters",
                            systemImage: "line.3.horizontal.decrease",
                            accessibilityIdentifier: "board-filter-menu-button",
                            showsActiveIndicator: !store.selectedRepoIds.isEmpty
                        ) {
                            showRepoFilters = true
                        }

                        TopBarIconButton(
                            title: "Settings",
                            systemImage: "gearshape",
                            accessibilityIdentifier: "board-settings-button",
                            action: onShowSettings
                        )
                    }
                }

                WorkbenchRepoContextStrip(
                    repos: store.repos,
                    selectedRepoSummary: store.selectedRepoSummary,
                    activeCount: store.counts[.running] ?? 0
                ) {
                    showRepoFilters = true
                }

                BoardFilterBar(selected: $store.filter, counts: store.counts)
                    .padding(.vertical, 8)

                Divider()

                content
            }
            .navigationBarHidden(true)
            .navigationDestination(for: BoardDestination.self) { destination in
                switch destination {
                case .issue(let owner, let repo, let number):
                    IssueDetailView(owner: owner, repo: repo, number: number)
                }
            }
            .navigationDestination(for: DraftDestination.self) { destination in
                DraftDetailView(draft: destination.draft, onSaved: {
                    Task { await store.load(api: api, refresh: true) }
                })
            }
            .sheet(isPresented: $showRepoFilters) {
                WorkbenchRepoFilterSheet(repos: store.repos, selectedRepoIds: $store.selectedRepoIds)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
            .task {
                if store.payload == nil {
                    await store.load(api: api)
                }
                applyPendingRoute()
            }
            .onChange(of: route) { _, _ in
                applyPendingRoute()
            }
            .accessibilityTabBarClearance()
        }
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoading && store.payload == nil {
            ProgressView("Loading board...")
                .frame(maxHeight: .infinity)
        } else if let errorMessage = store.errorMessage, store.payload == nil {
            ContentUnavailableView {
                Label("Board Unavailable", systemImage: "rectangle.grid.2x2")
            } description: {
                Text("\(errorMessage)\n\nRetry after starting issuectl web, or open Settings to update the server.")
            } actions: {
                HStack {
                    Button("Retry") { Task { await store.load(api: api, refresh: true) } }
                    Button("Open Settings", action: onShowSettings)
                }
            }
            .frame(maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    if let errorMessage = store.errorMessage {
                        OfflineStatusBanner(message: errorMessage)
                    }

                    BoardSummaryStrip(counts: store.counts, repoCount: store.repos.count)

                    if store.filter == .unassigned {
                        if store.visibleDrafts.isEmpty {
                            ContentUnavailableView {
                                Label("No Drafts", systemImage: store.filter.icon)
                            } description: {
                                Text(emptyDescription)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.top, 28)
                        } else {
                            ForEach(store.visibleDrafts) { draft in
                                NavigationLink(value: DraftDestination(draft: draft)) {
                                    WorkbenchDraftCard(draft: draft)
                                }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("board-draft-\(draft.id)")
                            }
                        }
                    } else if store.visibleIssues.isEmpty {
                        ContentUnavailableView {
                            Label("No Board Issues", systemImage: store.filter.icon)
                        } description: {
                            Text(emptyDescription)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 28)
                    } else {
                        ForEach(store.visibleIssues) { item in
                            Button {
                                navigationPath.append(BoardDestination.issue(
                                    owner: item.owner,
                                    repo: item.repoName,
                                    number: item.issue.number
                                ))
                            } label: {
                                WorkbenchIssueCard(item: item)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier(item.accessibilityIdentifier)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .refreshable { await store.load(api: api, refresh: true) }
        }
    }

    private var emptyDescription: String {
        switch store.filter {
        case .unassigned:
            return "Drafts from the web dashboard will appear here until they are assigned to a repository."
        case .open:
            return "No open issues matched the current repository filters."
        case .running:
            return "No running issue sessions matched the current repository filters."
        case .closed:
            return "No closed issues matched the current repository filters."
        }
    }

    private func applyPendingRoute() {
        guard case let .board(repoFullName, issueNumber, deploymentId) = route,
              store.payload != nil else {
            return
        }
        if let focus = store.applyBoardRoute(
            repoFullName: repoFullName,
            issueNumber: issueNumber,
            deploymentId: deploymentId
        ) {
            navigationPath.append(BoardDestination.issue(owner: focus.owner, repo: focus.repo, number: focus.number))
        }
        route = nil
    }
}

private enum BoardDestination: Hashable {
    case issue(owner: String, repo: String, number: Int)
}

private struct BoardFilterBar: View {
    @Binding var selected: WorkbenchIssueFilter
    let counts: [WorkbenchIssueFilter: Int]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(WorkbenchIssueFilter.allCases) { filter in
                    Button {
                        selected = filter
                    } label: {
                        Label {
                            HStack(spacing: 6) {
                                Text(filter.title)
                                Text("\(counts[filter] ?? 0)")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(selected == filter ? Color(.systemBackground) : .secondary)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(selected == filter ? IssueCTLColors.action : Color.secondary.opacity(0.14), in: Capsule())
                            }
                        } icon: {
                            Image(systemName: filter.icon)
                        }
                        .font(.subheadline.weight(selected == filter ? .semibold : .regular))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(selected == filter ? IssueCTLColors.action.opacity(0.14) : IssueCTLColors.cardBackground, in: Capsule())
                        .overlay {
                            Capsule()
                                .stroke(selected == filter ? IssueCTLColors.action.opacity(0.55) : IssueCTLColors.hairline, lineWidth: 0.75)
                        }
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(selected == filter ? IssueCTLColors.action : .secondary)
                    .accessibilityIdentifier("board-filter-\(filter.rawValue)")
                }
            }
            .padding(.horizontal, 16)
        }
    }
}

private struct BoardSummaryStrip: View {
    let counts: [WorkbenchIssueFilter: Int]
    let repoCount: Int

    var body: some View {
        HStack(spacing: 8) {
            BoardSummaryTile(
                title: "Drafts",
                value: counts[.unassigned] ?? 0,
                systemImage: "doc.text",
                tint: .orange,
                accessibilityIdentifier: "board-summary-unassigned"
            )

            BoardSummaryTile(
                title: "Open",
                value: counts[.open] ?? 0,
                systemImage: "circle",
                tint: IssueCTLColors.action,
                accessibilityIdentifier: "board-summary-open"
            )

            BoardSummaryTile(
                title: "Running",
                value: counts[.running] ?? 0,
                systemImage: "play.circle",
                tint: .green,
                accessibilityIdentifier: "board-summary-running"
            )

            BoardSummaryTile(
                title: "Repos",
                value: repoCount,
                systemImage: "folder",
                tint: .blue,
                accessibilityIdentifier: "board-summary-repos"
            )
        }
    }
}

private struct BoardSummaryTile: View {
    let title: String
    let value: Int
    let systemImage: String
    let tint: Color
    let accessibilityIdentifier: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: systemImage)
                .font(.caption.weight(.bold))
                .foregroundStyle(tint)
                .accessibilityHidden(true)

            Text("\(value)")
                .font(.title3.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius))
        .overlay {
            RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(value)")
        .accessibilityIdentifier(accessibilityIdentifier)
    }
}

private struct WorkbenchRepoContextStrip: View {
    let repos: [WorkbenchRepo]
    let selectedRepoSummary: String
    let activeCount: Int
    let onTap: () -> Void

    var body: some View {
        if repos.count > 1 || activeCount > 0 {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Button(action: onTap) {
                        RepoContextChip(
                            title: "Repos",
                            value: selectedRepoSummary,
                            systemImage: "folder"
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("board-repo-filter-button")

                    if activeCount > 0 {
                        RepoContextChip(
                            title: "Running",
                            value: "\(activeCount)",
                            systemImage: "bolt.fill",
                            tint: .green
                        )
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
        }
    }
}

private struct WorkbenchIssueCard: View {
    let item: WorkbenchBoardIssue

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(RepoColors.color(for: item.repoIndex))
                .frame(width: 10, height: 10)
                .padding(.top, 7)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(item.repoFullName)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    Text("#\(item.issue.number)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                }

                Text(item.issue.title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)

                HStack(spacing: 6) {
                    BoardIssueChip(title: item.statusLabel, tint: item.isRunning ? .green : .secondary)
                    BoardIssueChip(title: item.issue.priority.rawValue.capitalized, tint: priorityTint)
                    ForEach(item.issue.labels.prefix(2), id: \.self) { label in
                        BoardIssueChip(title: label, tint: IssueCTLColors.action)
                    }
                }
            }

            Spacer(minLength: 8)

            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(.tertiary)
                .padding(.top, 4)
                .accessibilityHidden(true)
        }
        .padding(12)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius))
        .overlay {
            RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius)
                .stroke(item.isRunning ? Color.green.opacity(0.45) : IssueCTLColors.hairline, lineWidth: item.isRunning ? 1 : 0.5)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.repoFullName) issue #\(item.issue.number), \(item.issue.title), \(item.statusLabel)")
    }

    private var priorityTint: Color {
        switch item.issue.priority {
        case .high:
            return .red
        case .normal:
            return .secondary
        case .low:
            return .blue
        }
    }
}

private struct WorkbenchDraftCard: View {
    let draft: Draft

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "doc.text")
                .font(.body.weight(.semibold))
                .foregroundStyle(.orange)
                .padding(.top, 3)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    BoardIssueChip(title: "Draft", tint: .orange)
                    if let priority = draft.priority {
                        BoardIssueChip(title: priority.rawValue.capitalized, tint: priority == .high ? .red : .secondary)
                    }
                }

                Text(draft.title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)

                if let body = draft.body, !body.isEmpty {
                    Text(body)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }

            Spacer(minLength: 8)

            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(.tertiary)
                .padding(.top, 4)
                .accessibilityHidden(true)
        }
        .padding(12)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius))
        .overlay {
            RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Draft, \(draft.title)")
    }
}

private struct BoardIssueChip: View {
    let title: String
    let tint: Color

    var body: some View {
        Text(title)
            .font(.caption2.weight(.semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .foregroundStyle(tint)
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .background(tint.opacity(0.12), in: Capsule())
    }
}

private struct WorkbenchRepoFilterSheet: View {
    let repos: [WorkbenchRepo]
    @Binding var selectedRepoIds: Set<Int>
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Button {
                    selectedRepoIds.removeAll()
                } label: {
                    Label("All repositories", systemImage: selectedRepoIds.isEmpty ? "checkmark.circle.fill" : "circle")
                }
                .accessibilityIdentifier("board-repo-filter-all")

                ForEach(Array(repos.enumerated()), id: \.element.id) { index, repo in
                    Button {
                        if selectedRepoIds.contains(repo.id) {
                            selectedRepoIds.remove(repo.id)
                        } else {
                            selectedRepoIds.insert(repo.id)
                        }
                    } label: {
                        HStack {
                            Circle()
                                .fill(RepoColors.color(for: index))
                                .frame(width: 10, height: 10)
                                .accessibilityHidden(true)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(repo.name)
                                    .font(.body)
                                Text("\(repo.owner)/\(repo.name)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            if selectedRepoIds.contains(repo.id) {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(IssueCTLColors.action)
                            }
                        }
                    }
                    .accessibilityIdentifier("board-repo-filter-\(repo.id)")
                }
            }
            .navigationTitle("Board Filters")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("board-repo-filter-done")
                }
            }
        }
    }
}
