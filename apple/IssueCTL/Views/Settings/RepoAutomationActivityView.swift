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
    @State private var reviewDetailTarget: ReviewRunDetailTarget?

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
        .sheet(item: $reviewDetailTarget) { target in
            ReviewRunDetailSheet(reviewId: target.id)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
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
                    ReviewRunActivityRow(run: run) {
                        reviewDetailTarget = ReviewRunDetailTarget(id: run.id)
                    }
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
