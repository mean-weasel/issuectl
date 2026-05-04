import SwiftUI

struct OfflineQueueView: View {
    @Environment(OfflineSyncService.self) private var offlineSync
    @State private var syncResult: OfflineSyncResult?

    var body: some View {
        List {
            summarySection

            if offlineSync.actions.isEmpty {
                emptySection
            } else {
                actionsSection
            }
        }
        .navigationTitle("Offline Queue")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if offlineSync.isSyncing {
                    ProgressView()
                } else if !offlineSync.actions.isEmpty {
                    Button("Sync") {
                        sync()
                    }
                    .font(.subheadline.weight(.semibold))
                    .disabled(offlineSync.pendingCount == 0)
                    .accessibilityIdentifier("offline-queue-sync-button")
                }
            }
        }
        .task {
            offlineSync.refreshCounts()
        }
        .refreshable {
            syncResult = await offlineSync.syncPendingActions()
        }
    }

    private var summarySection: some View {
        Section {
            HStack(spacing: 12) {
                QueueMetricView(title: "Pending", value: offlineSync.pendingCount, tint: .orange)
                QueueMetricView(title: "Failed", value: offlineSync.failedCount, tint: .red)
                QueueMetricView(title: "Total", value: offlineSync.actions.count, tint: IssueCTLColors.action)
            }

            if let syncResult {
                Text(resultSummary(syncResult))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if offlineSync.failedCount > 0 {
                HStack {
                    Button {
                        offlineSync.retryFailedActions()
                    } label: {
                        Label("Retry Failed", systemImage: "arrow.clockwise")
                    }
                    .accessibilityIdentifier("offline-queue-retry-failed-button")

                    Spacer()

                    Button(role: .destructive) {
                        offlineSync.clearFailedActions()
                    } label: {
                        Label("Clear Failed", systemImage: "trash")
                    }
                    .accessibilityIdentifier("offline-queue-clear-failed-button")
                }
                .font(.subheadline.weight(.semibold))
                .buttonStyle(.borderless)
            }
        }
    }

    private var emptySection: some View {
        Section {
            ContentUnavailableView {
                Label("Queue Empty", systemImage: "checkmark.circle")
            } description: {
                Text("Offline issue actions will appear here until they sync.")
            }
        }
    }

    private var actionsSection: some View {
        Section("Actions") {
            ForEach(offlineSync.actions) { action in
                NavigationLink {
                    OfflineQueueActionDetailView(action: action)
                } label: {
                    OfflineQueueActionRow(action: action)
                }
                .accessibilityIdentifier("offline-queue-action-\(action.id)")
                .buttonStyle(.plain)
                .contextMenu {
                    Button(role: .destructive) {
                        offlineSync.removeAction(id: action.id)
                    } label: {
                        Label("Remove", systemImage: "trash")
                    }
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        offlineSync.removeAction(id: action.id)
                    } label: {
                        Label("Remove", systemImage: "trash")
                    }
                }
            }
        }
    }

    private func sync() {
        Task {
            syncResult = await offlineSync.syncPendingActions()
        }
    }

    private func resultSummary(_ result: OfflineSyncResult) -> String {
        if result.alreadyRunning {
            return "Sync already in progress."
        }

        if result.attempted == 0 {
            return "No pending actions to sync."
        }

        var parts = ["\(result.completed) synced"]
        if result.failed > 0 {
            parts.append("\(result.failed) failed")
        }
        return parts.joined(separator: ", ")
    }
}

private struct OfflineQueueActionDetailView: View {
    @Environment(OfflineSyncService.self) private var offlineSync
    @Environment(\.dismiss) private var dismiss
    let action: QueuedOfflineAction

    var body: some View {
        List {
            Section {
                LabeledContent("Action", value: actionTitle)
                LabeledContent("Repository", value: repository)
                LabeledContent("Issue", value: "#\(issueNumber)")
                LabeledContent("Status", value: statusTitle)
                LabeledContent("Queued", value: dateSummary(action.createdAt))
                LabeledContent("Updated", value: dateSummary(action.updatedAt))
                if action.retryCount > 0 {
                    LabeledContent("Retries", value: "\(action.retryCount)")
                }
            }

            if let bodyText, !bodyText.isEmpty {
                Section(bodyHeader) {
                    Text(bodyText)
                        .font(.body)
                        .textSelection(.enabled)
                }
            }

            if let error = action.lastError, !error.isEmpty {
                Section("Last Error") {
                    Text(error)
                        .font(.body)
                        .foregroundStyle(.red)
                        .textSelection(.enabled)
                }
            }

            Section {
                Button(role: .destructive) {
                    offlineSync.removeAction(id: action.id)
                    dismiss()
                } label: {
                    Label("Remove Action", systemImage: "trash")
                }
            }
        }
        .navigationTitle(actionTitle)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var actionTitle: String {
        switch action.kind {
        case .issueComment:
            return "Issue Comment"
        case .issueState(let state):
            return state.state.lowercased() == "closed" ? "Close Issue" : "Reopen Issue"
        }
    }

    private var repository: String {
        switch action.kind {
        case .issueComment(let comment):
            return "\(comment.owner)/\(comment.repo)"
        case .issueState(let state):
            return "\(state.owner)/\(state.repo)"
        }
    }

    private var issueNumber: Int {
        switch action.kind {
        case .issueComment(let comment):
            return comment.issueNumber
        case .issueState(let state):
            return state.issueNumber
        }
    }

    private var bodyHeader: String {
        switch action.kind {
        case .issueComment:
            return "Comment"
        case .issueState:
            return "Comment"
        }
    }

    private var bodyText: String? {
        switch action.kind {
        case .issueComment(let comment):
            return comment.body
        case .issueState(let state):
            return state.comment
        }
    }

    private var statusTitle: String {
        switch action.status {
        case .pending:
            return "Pending"
        case .inFlight:
            return "Syncing"
        case .failed:
            return "Failed"
        }
    }

    private func dateSummary(_ timestamp: String) -> String {
        guard let date = parseIssueCTLDate(timestamp) else {
            return timestamp
        }

        let absolute = DateFormatter()
        absolute.dateStyle = .medium
        absolute.timeStyle = .short

        let relative = RelativeDateTimeFormatter()
        relative.unitsStyle = .abbreviated
        return "\(absolute.string(from: date)) (\(relative.localizedString(for: date, relativeTo: Date())))"
    }
}

private struct QueueMetricView: View {
    let title: String
    let value: Int
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("\(value)")
                .font(.title3.weight(.semibold))
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

private struct OfflineQueueActionRow: View {
    let action: QueuedOfflineAction

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Label(title, systemImage: icon)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)

                Spacer(minLength: 8)

                statusBadge
            }

            Text(repository)
                .font(.caption)
                .foregroundStyle(.secondary)

            if let preview, !preview.isEmpty {
                Text(preview)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }

            HStack(spacing: 10) {
                Text(createdSummary)
                if action.retryCount > 0 {
                    Text("Retries \(action.retryCount)")
                }
            }
            .font(.caption2)
            .foregroundStyle(.tertiary)

            if let error = action.lastError, !error.isEmpty {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(3)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private var title: String {
        switch action.kind {
        case .issueComment(let comment):
            return "Comment on #\(comment.issueNumber)"
        case .issueState(let state):
            let verb = state.state.lowercased() == "closed" ? "Close" : "Reopen"
            return "\(verb) #\(state.issueNumber)"
        }
    }

    private var repository: String {
        switch action.kind {
        case .issueComment(let comment):
            return "\(comment.owner)/\(comment.repo)"
        case .issueState(let state):
            return "\(state.owner)/\(state.repo)"
        }
    }

    private var preview: String? {
        switch action.kind {
        case .issueComment(let comment):
            return comment.body
        case .issueState(let state):
            return state.comment
        }
    }

    private var icon: String {
        switch action.kind {
        case .issueComment:
            return "text.bubble"
        case .issueState(let state):
            return state.state.lowercased() == "closed" ? "checkmark.circle" : "arrow.uturn.backward.circle"
        }
    }

    private var statusBadge: some View {
        Text(statusTitle)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .foregroundStyle(statusTint)
            .background(statusTint.opacity(0.12), in: Capsule())
    }

    private var statusTitle: String {
        switch action.status {
        case .pending:
            return "Pending"
        case .inFlight:
            return "Syncing"
        case .failed:
            return "Failed"
        }
    }

    private var statusTint: Color {
        switch action.status {
        case .pending:
            return .orange
        case .inFlight:
            return IssueCTLColors.action
        case .failed:
            return .red
        }
    }

    private var createdSummary: String {
        guard let created = parseIssueCTLDate(action.createdAt) else {
            return "Queued"
        }

        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return "Queued \(formatter.localizedString(for: created, relativeTo: Date()))"
    }
}
