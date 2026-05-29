import SwiftUI

enum RepoAutomationActivityScope: String, CaseIterable, Identifiable {
    case all
    case issues
    case pullRequests

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all:
            return "All"
        case .issues:
            return "Issues"
        case .pullRequests:
            return "PRs"
        }
    }
}

struct RepoAutomationActivityQuery: Equatable {
    var scope: RepoAutomationActivityScope = .all
    var numberText = ""
    var reviewStatus: ReviewRunStatusFilter = .all

    var webhookTargetType: DeploymentTargetType? {
        switch scope {
        case .all:
            return nil
        case .issues:
            return .issue
        case .pullRequests:
            return .pr
        }
    }

    var webhookTargetNumber: Int? {
        parsedNumber
    }

    var reviewPRNumber: Int? {
        scope == .pullRequests ? parsedNumber : nil
    }

    private var parsedNumber: Int? {
        let trimmed = numberText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return Int(trimmed)
    }
}

struct RepoAutomationActivityView: View {
    @Environment(APIClient.self) private var api

    let repo: Repo

    @State private var query = RepoAutomationActivityQuery()
    @State private var webhookEvents: [WebhookEvent] = []
    @State private var reviewRuns: [ReviewRun] = []
    @State private var isLoadingWebhookEvents = false
    @State private var isLoadingReviewRuns = false
    @State private var webhookEventsError: String?
    @State private var reviewRunsError: String?
    @State private var webhookResponse: WebhookEventsResponse?
    @State private var reviewRunsResponse: ReviewRunsResponse?

    var body: some View {
        Form {
            filterSection
            webhookEventsSection
            reviewRunsSection
        }
        .navigationTitle("Automation Activity")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await loadActivity() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(isLoading)
                .accessibilityLabel("Refresh automation activity")
            }
        }
        .task {
            await loadActivity()
        }
        .refreshable {
            await loadActivity()
        }
    }

    private var isLoading: Bool {
        isLoadingWebhookEvents || isLoadingReviewRuns
    }

    private var filterSection: some View {
        Section {
            Picker("Scope", selection: $query.scope) {
                ForEach(RepoAutomationActivityScope.allCases) { scope in
                    Text(scope.title).tag(scope)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("repo-automation-activity-scope-picker")
            .onChange(of: query.scope) { _, scope in
                if scope == .all {
                    query.numberText = ""
                }
            }

            TextField(numberPrompt, text: $query.numberText)
                .keyboardType(.numberPad)
                .disabled(query.scope == .all)
                .accessibilityIdentifier("repo-automation-activity-number-field")

            Picker("Review status", selection: $query.reviewStatus) {
                ForEach(ReviewRunStatusFilter.allCases) { status in
                    Text(status.displayName).tag(status)
                }
            }
            .accessibilityIdentifier("repo-automation-activity-status-picker")

            Button {
                Task { await loadActivity() }
            } label: {
                HStack {
                    Label("Apply Filters", systemImage: "line.3.horizontal.decrease.circle")
                    Spacer()
                    if isLoading {
                        ProgressView()
                    }
                }
            }
            .disabled(isLoading)
            .accessibilityIdentifier("repo-automation-activity-apply-button")
        } header: {
            Text(repo.fullName)
        } footer: {
            Text("Filters apply to webhook events. PR number and review status also apply to review runs.")
        }
    }

    private var webhookEventsSection: some View {
        Section {
            if isLoadingWebhookEvents && webhookEvents.isEmpty {
                loadingRow("Loading webhook events...")
            } else if let webhookEventsError {
                errorRow(message: webhookEventsError) {
                    Task { await loadWebhookEvents() }
                }
            } else if webhookEvents.isEmpty {
                ContentUnavailableView {
                    Label("No Webhook Events", systemImage: "dot.radiowaves.left.and.right")
                } description: {
                    Text("No retained webhook deliveries match these filters.")
                }
            } else {
                ForEach(webhookEvents) { event in
                    WebhookEventActivityRow(event: event)
                }
            }
        } header: {
            sectionHeader(title: "Webhook Events", count: webhookEvents.count, isLoading: isLoadingWebhookEvents)
        } footer: {
            cacheFooter(fromCache: webhookResponse?.fromCache, cachedAt: webhookResponse?.cachedAt)
        }
    }

    private var reviewRunsSection: some View {
        Section {
            if isLoadingReviewRuns && reviewRuns.isEmpty {
                loadingRow("Loading review runs...")
            } else if let reviewRunsError {
                errorRow(message: reviewRunsError) {
                    Task { await loadReviewRuns() }
                }
            } else if reviewRuns.isEmpty {
                ContentUnavailableView {
                    Label("No Review Runs", systemImage: "checkmark.shield")
                } description: {
                    Text("No repo automation review runs match these filters.")
                }
            } else {
                ForEach(reviewRuns) { run in
                    ReviewRunActivityRow(run: run)
                }
            }
        } header: {
            sectionHeader(title: "Review Runs", count: reviewRuns.count, isLoading: isLoadingReviewRuns)
        } footer: {
            cacheFooter(fromCache: reviewRunsResponse?.fromCache, cachedAt: reviewRunsResponse?.cachedAt)
        }
    }

    private var numberPrompt: String {
        switch query.scope {
        case .all:
            return "Target number"
        case .issues:
            return "Issue number"
        case .pullRequests:
            return "PR number"
        }
    }

    private func sectionHeader(title: String, count: Int, isLoading: Bool) -> some View {
        HStack {
            Text(title)
            Spacer()
            if isLoading {
                ProgressView()
            } else {
                Text("\(count)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func cacheFooter(fromCache: Bool?, cachedAt: String?) -> some View {
        if fromCache == true {
            if let cachedAt {
                Text("Showing cached data from \(cachedAt).")
            } else {
                Text("Showing cached data.")
            }
        }
    }

    private func loadingRow(_ title: String) -> some View {
        HStack {
            Spacer()
            ProgressView(title)
            Spacer()
        }
    }

    private func errorRow(message: String, retry: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(message, systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
                .font(.caption)
            Button("Retry", action: retry)
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
    }

    private func loadActivity() async {
        await loadWebhookEvents()
        await loadReviewRuns()
    }

    private func loadWebhookEvents() async {
        isLoadingWebhookEvents = true
        webhookEventsError = nil
        defer { isLoadingWebhookEvents = false }

        do {
            let response = try await api.webhookEvents(
                owner: repo.owner,
                repo: repo.name,
                targetType: query.webhookTargetType,
                targetNumber: query.webhookTargetNumber,
                limit: 50
            )
            webhookResponse = response
            webhookEvents = response.events
        } catch {
            webhookEventsError = error.localizedDescription
            webhookResponse = nil
            webhookEvents = []
        }
    }

    private func loadReviewRuns() async {
        isLoadingReviewRuns = true
        reviewRunsError = nil
        defer { isLoadingReviewRuns = false }

        do {
            let response = try await api.reviewRuns(
                owner: repo.owner,
                repo: repo.name,
                pr: query.reviewPRNumber,
                status: query.reviewStatus,
                limit: 24
            )
            reviewRunsResponse = response
            reviewRuns = response.reviewRuns
        } catch {
            reviewRunsError = error.localizedDescription
            reviewRunsResponse = nil
            reviewRuns = []
        }
    }
}

private struct WebhookEventActivityRow: View {
    let event: WebhookEvent

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: event.iconName)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(event.tint)
                .frame(width: 30, height: 30)
                .background(event.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 5) {
                Text(event.activityTitle)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)

                if let detail = event.activityDetail {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Text(event.deliveryLine)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

private struct ReviewRunActivityRow: View {
    let run: ReviewRun

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: run.status.iconName)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(run.status.tint)
                .frame(width: 30, height: 30)
                .background(run.status.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline) {
                    Text("PR #\(run.prNumber)")
                        .font(.subheadline.weight(.semibold))
                    Spacer(minLength: 8)
                    Text(run.status.displayName)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(run.status.tint)
                }

                if let summary = run.summary, !summary.isEmpty {
                    Text(summary)
                        .font(.caption)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Text(run.detailLine)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

private extension WebhookEvent {
    var activityTitle: String {
        var parts = [eventType]
        if let action, !action.isEmpty {
            parts.append(action)
        }
        if let target = targetLabel ?? fallbackTargetLabel {
            parts.append(target)
        }
        return parts.joined(separator: " ")
    }

    var activityDetail: String? {
        var parts: [String] = []
        if let senderLogin, !senderLogin.isEmpty {
            parts.append("by \(senderLogin)")
        }
        if let result, !result.isEmpty {
            if let resultDetail, !resultDetail.isEmpty {
                parts.append("\(result): \(resultDetail)")
            } else {
                parts.append(result)
            }
        }
        if let intent {
            parts.append("intent \(intent.status)")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var deliveryLine: String {
        var parts = [deliveryId]
        if let receivedAtIso, !receivedAtIso.isEmpty {
            parts.append(receivedAtIso)
        }
        return parts.joined(separator: " · ")
    }

    var iconName: String {
        switch targetType {
        case .issue:
            return "smallcircle.filled.circle"
        case .pr:
            return "arrow.triangle.pull"
        case nil:
            return "dot.radiowaves.left.and.right"
        }
    }

    var tint: Color {
        switch result {
        case "accepted", "scheduled", "processed":
            return .green
        case "ignored", "skipped":
            return .secondary
        case "failed", "error":
            return .red
        default:
            return IssueCTLColors.action
        }
    }

    private var fallbackTargetLabel: String? {
        guard let targetType, let targetNumber else { return nil }
        switch targetType {
        case .issue:
            return "Issue #\(targetNumber)"
        case .pr:
            return "PR #\(targetNumber)"
        }
    }
}

private extension ReviewRun {
    var detailLine: String {
        var parts: [String] = []
        if let rangeLabel, !rangeLabel.isEmpty {
            parts.append(rangeLabel)
        }
        if let findingCount {
            parts.append("\(findingCount) finding\(findingCount == 1 ? "" : "s")")
        }
        if let headRef, !headRef.isEmpty {
            parts.append(headRef)
        }
        if let completedAtIso, !completedAtIso.isEmpty {
            parts.append(completedAtIso)
        } else if let startedAtIso, !startedAtIso.isEmpty {
            parts.append(startedAtIso)
        }
        return parts.isEmpty ? triggeredBy.displayName : parts.joined(separator: " · ")
    }
}

private extension ReviewRunStatus {
    var displayName: String {
        switch self {
        case .reserved:
            return "Reserved"
        case .launching:
            return "Launching"
        case .inProgress:
            return "In Progress"
        case .completed:
            return "Completed"
        case .failed:
            return "Failed"
        case .superseded:
            return "Superseded"
        }
    }

    var iconName: String {
        switch self {
        case .reserved:
            return "clock"
        case .launching:
            return "paperplane"
        case .inProgress:
            return "arrow.clockwise"
        case .completed:
            return "checkmark.circle.fill"
        case .failed:
            return "exclamationmark.triangle.fill"
        case .superseded:
            return "arrow.uturn.backward.circle"
        }
    }

    var tint: Color {
        switch self {
        case .reserved, .launching, .inProgress:
            return IssueCTLColors.action
        case .completed:
            return .green
        case .failed:
            return .red
        case .superseded:
            return .secondary
        }
    }
}

private extension ReviewRunStatusFilter {
    var displayName: String {
        switch self {
        case .all:
            return "All"
        case .reserved:
            return "Reserved"
        case .launching:
            return "Launching"
        case .inProgress:
            return "In Progress"
        case .completed:
            return "Completed"
        case .failed:
            return "Failed"
        case .superseded:
            return "Superseded"
        }
    }
}
