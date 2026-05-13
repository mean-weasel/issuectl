import SwiftUI

struct MacIssuesView: View {
    let store: MacSidebarStore

    @State private var searchText = ""
    @State private var selectedFilter: IssueFilter = .open
    @State private var selectedIssue: MacIssueListItem?

    private var visibleIssues: [MacIssueListItem] {
        let filtered = store.issues.filter { item in
            switch selectedFilter {
            case .open:
                item.issue.isOpen
            case .all:
                true
            case .unassigned:
                item.issue.isOpen && (item.issue.assignees ?? []).isEmpty
            }
        }

        guard !searchText.isEmpty else { return filtered }
        let query = searchText.lowercased()
        return filtered.filter { item in
            item.issue.title.lowercased().contains(query)
                || (item.issue.body ?? "").lowercased().contains(query)
                || item.repoFullName.lowercased().contains(query)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            controls

            if store.isLoading && store.issues.isEmpty {
                ProgressView("Loading issues...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage = store.errorMessage, store.issues.isEmpty {
                ContentUnavailableView("Could not load issues", systemImage: "wifi.exclamationmark", description: Text(errorMessage))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if visibleIssues.isEmpty {
                ContentUnavailableView(emptyTitle, systemImage: "tray", description: Text(emptyDescription))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(visibleIssues) { item in
                    Button {
                        selectedIssue = item
                    } label: {
                        MacIssueRow(item: item, isRunning: isRunning(item))
                    }
                    .buttonStyle(.plain)
                }
                .listStyle(.plain)
            }
        }
        .sheet(item: $selectedIssue) { item in
            MacIssueDetailView(item: item, store: store)
        }
    }

    private var controls: some View {
        VStack(spacing: 8) {
            TextField("Search issues", text: $searchText)
                .textFieldStyle(.roundedBorder)

            Picker("Filter", selection: $selectedFilter) {
                ForEach(IssueFilter.allCases) { filter in
                    Text(filter.title).tag(filter)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
        }
        .padding(12)
    }

    private func isRunning(_ item: MacIssueListItem) -> Bool {
        store.sessions.contains { session in
            session.owner == item.repo.owner
                && session.repoName == item.repo.name
                && session.issueNumber == item.issue.number
                && session.isActive
        }
    }

    private var emptyTitle: String {
        searchText.isEmpty ? "No Issues" : "No Matches"
    }

    private var emptyDescription: String {
        if !searchText.isEmpty {
            return "Clear search to show visible issues."
        }
        switch selectedFilter {
        case .open:
            return "No open issues are visible in tracked repos."
        case .unassigned:
            return "Every visible open issue has an assignee."
        case .all:
            return "No issues are visible in tracked repos."
        }
    }
}

private enum IssueFilter: String, CaseIterable, Identifiable {
    case open
    case unassigned
    case all

    var id: String { rawValue }

    var title: String {
        switch self {
        case .open: "Open"
        case .unassigned: "Unassigned"
        case .all: "All"
        }
    }
}

private struct MacIssueRow: View {
    let item: MacIssueListItem
    let isRunning: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(item.issue.title)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(2)
                if isRunning {
                    Image(systemName: "terminal.fill")
                        .foregroundStyle(.green)
                        .help("Session running")
                }
            }

            HStack(spacing: 8) {
                Text(item.repoFullName)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text("#\(item.issue.number)")
                    .foregroundStyle(.secondary)
                Spacer(minLength: 4)
                if !item.issue.labels.isEmpty {
                    Label("\(item.issue.labels.count)", systemImage: "tag")
                        .labelStyle(.titleAndIcon)
                        .foregroundStyle(.secondary)
                }
                if let assignees = item.issue.assignees, !assignees.isEmpty {
                    Label("\(assignees.count)", systemImage: "person")
                        .labelStyle(.titleAndIcon)
                        .foregroundStyle(.secondary)
                }
                if !item.issue.timeAgo.isEmpty {
                    Text(item.issue.timeAgo)
                        .foregroundStyle(.secondary)
                }
            }
            .font(.caption)
        }
        .padding(.vertical, 5)
    }
}
