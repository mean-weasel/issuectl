import SwiftUI

struct AutomationFeedView: View {
    @Environment(APIClient.self) private var api

    @State private var reviewStatus: ReviewRunStatusFilter = .all
    @State private var webhookEvents: [WebhookEvent] = []
    @State private var reviewRuns: [ReviewRun] = []
    @State private var isLoadingWebhookEvents = false
    @State private var isLoadingReviewRuns = false
    @State private var webhookEventsError: String?
    @State private var reviewRunsError: String?
    @State private var webhookResponse: WebhookEventsResponse?
    @State private var reviewRunsResponse: ReviewRunsResponse?
    @State private var reviewDetailTarget: ReviewRunDetailTarget?
    @State private var isLiveStreamConnected = false

    var body: some View {
        Form {
            filtersSection
            webhookEventsSection
            reviewRunsSection
        }
        .navigationTitle("Automation Feed")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await loadFeed() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(isLoading)
                .accessibilityLabel("Refresh automation feed")
            }
        }
        .task(id: reviewStatus) {
            await loadFeed()
            await pollFeed()
        }
        .task {
            await streamFeedUpdates()
        }
        .refreshable {
            await loadFeed()
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

    private var filtersSection: some View {
        Section {
            Picker("Review status", selection: $reviewStatus) {
                ForEach(ReviewRunStatusFilter.allCases) { status in
                    Text(status.displayName).tag(status)
                }
            }
            .accessibilityIdentifier("automation-feed-review-status-picker")

            Label(
                isLiveStreamConnected ? "Live webhook updates connected" : "Live webhook updates reconnecting",
                systemImage: isLiveStreamConnected ? "dot.radiowaves.left.and.right" : "antenna.radiowaves.left.and.right.slash"
            )
            .font(.caption)
            .foregroundStyle(isLiveStreamConnected ? .green : .secondary)
            .accessibilityIdentifier("automation-feed-live-stream-status")
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
                    Text("No retained webhook deliveries are available.")
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
                    Text("No PR review runs match this status.")
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

    private func pollFeed() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(60))
            guard !Task.isCancelled else { return }
            await loadFeed()
        }
    }

    private func streamFeedUpdates() async {
        while !Task.isCancelled {
            let task: URLSessionWebSocketTask
            do {
                task = try api.webhookEventsStreamTask()
                task.resume()
                isLiveStreamConnected = true
                defer {
                    task.cancel(with: .goingAway, reason: nil)
                    isLiveStreamConnected = false
                }
                while !Task.isCancelled {
                    _ = try await task.receive()
                    await loadFeed()
                }
            } catch {
                isLiveStreamConnected = false
                try? await Task.sleep(for: .seconds(5))
            }
        }
    }

    private func loadFeed() async {
        async let events: () = loadWebhookEvents()
        async let reviews: () = loadReviewRuns()
        _ = await (events, reviews)
    }

    private func loadWebhookEvents() async {
        isLoadingWebhookEvents = true
        webhookEventsError = nil
        defer { isLoadingWebhookEvents = false }

        do {
            let response = try await api.globalWebhookEvents(limit: 50)
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
            let response = try await api.globalReviewRuns(status: reviewStatus, limit: 50)
            reviewRunsResponse = response
            reviewRuns = response.reviewRuns
        } catch {
            reviewRunsError = error.localizedDescription
            reviewRunsResponse = nil
            reviewRuns = []
        }
    }
}
