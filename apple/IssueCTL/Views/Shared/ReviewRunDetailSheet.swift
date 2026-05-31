import SwiftUI

struct ReviewRunDetailTarget: Identifiable {
    let id: Int
}

struct ReviewRunDetailSheet: View {
    @Environment(APIClient.self) private var api
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    let reviewId: Int

    @State private var detail: ReviewRunDetailResponse?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var actionInFlight: ReviewRunActionMode?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if isLoading && detail == nil {
                        ProgressView("Loading review...")
                            .frame(maxWidth: .infinity, minHeight: 220)
                    } else if let errorMessage, detail == nil {
                        unavailableState(errorMessage)
                    } else if let detail {
                        detailContent(detail)
                    }
                }
                .padding(16)
            }
            .navigationTitle("Review Run")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .task(id: reviewId) {
                await load()
            }
        }
    }

    private func detailContent(_ detail: ReviewRunDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            header(detail)

            if !detail.banners.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(detail.banners) { banner in
                        bannerCard(banner)
                    }
                }
            }

            reviewActions(detail)

            sectionCard(title: "Run Details", systemImage: "info.circle") {
                detailRows([
                    ("Repository", detail.repo.fullName),
                    ("Range", detail.review.rangeLabel ?? detail.review.reviewedToSha),
                    ("Head", "\(detail.review.headRepoFullName ?? detail.repo.fullName):\(detail.review.headRef ?? "")"),
                    ("Base", detail.review.reviewBaseSha ?? "Not recorded"),
                    ("Session", detail.deployment.map { "#\($0.id) \($0.branchName)" } ?? "No linked session"),
                    ("Trigger", detail.review.triggeredBy.displayName),
                ])
            }

            sectionCard(title: "Lineage", systemImage: "timeline.selection") {
                if detail.lineage.isEmpty {
                    Text("No sibling review runs recorded.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(detail.lineage) { item in
                            lineageRow(item)
                        }
                    }
                }
            }

            sectionCard(title: "Findings", systemImage: "exclamationmark.bubble") {
                if detail.findings.isEmpty {
                    Text("No structured findings were recorded for this review.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(detail.findings) { finding in
                            findingRow(finding)
                        }
                    }
                }
            }

            sectionCard(title: "Diagnostics", systemImage: "waveform.path.ecg") {
                ReviewRunDetailDiagnosticsSummaryCard(response: detail.diagnostics)
                if detail.diagnostics.events.isEmpty {
                    Text("No diagnostic events recorded for this PR target yet.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(detail.diagnostics.events.prefix(8)) { event in
                            ReviewRunDetailDiagnosticEventCard(event: event)
                        }
                    }
                }
            }

            sectionCard(title: "Links", systemImage: "link") {
                VStack(alignment: .leading, spacing: 10) {
                    linkButton(title: "GitHub PR", systemImage: "arrow.triangle.merge", urlString: detail.links.githubPr)
                    if let githubReview = detail.links.githubReview {
                        linkButton(title: "GitHub Review", systemImage: "checkmark.bubble", urlString: githubReview)
                    }
                    linkButton(title: "Review Files", systemImage: "doc.text.magnifyingglass", urlString: detail.links.githubReviewFiles)

                    VStack(alignment: .leading, spacing: 6) {
                        Text("CLI fallback")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(detail.links.diagnosticsCli)
                            .font(.caption.monospaced())
                            .textSelection(.enabled)
                            .lineLimit(4)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
                }
            }

            if !detail.actions.mobileWriteActionsEnabled {
                Label("Retry and full-rerun actions are available on the web review page for now.", systemImage: "lock")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 2)
            }

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
        }
    }

    private func reviewActions(_ detail: ReviewRunDetailResponse) -> some View {
        sectionCard(title: "Actions", systemImage: "arrow.clockwise.circle") {
            VStack(alignment: .leading, spacing: 10) {
                if let disabledReason = detail.actions.disabledReason {
                    Label(disabledReason, systemImage: "hourglass")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                HStack(spacing: 10) {
                    actionButton(
                        title: "Retry",
                        systemImage: "arrow.clockwise",
                        mode: .retry,
                        enabled: detail.actions.mobileWriteActionsEnabled && detail.actions.canRetry
                    )
                    actionButton(
                        title: "Full rerun",
                        systemImage: "arrow.triangle.2.circlepath",
                        mode: .full,
                        enabled: detail.actions.mobileWriteActionsEnabled && detail.actions.canFullRerun
                    )
                }
            }
        }
    }

    private func actionButton(title: String, systemImage: String, mode: ReviewRunActionMode, enabled: Bool) -> some View {
        Button {
            Task { await requestAction(mode) }
        } label: {
            HStack(spacing: 7) {
                if actionInFlight == mode {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Image(systemName: systemImage)
                }
                Text(title)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .disabled(!enabled || actionInFlight != nil)
        .accessibilityIdentifier("review-run-\(mode.rawValue)-button")
    }

    private func header(_ detail: ReviewRunDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(detail.review.status.displayName)
                    .font(.caption.bold())
                    .foregroundStyle(detail.review.status.tint)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(detail.review.status.tint.opacity(0.14), in: Capsule())
                Text(detail.review.triggeredBy.displayName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Text("Run #\(detail.review.id)")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
            }

            Text("PR #\(detail.review.prNumber)")
                .font(.title2.weight(.bold))
            Text(detail.repo.fullName)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text(detail.review.summary ?? "No review summary recorded.")
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                if let findingCount = detail.review.findingCount {
                    metric(value: "\(findingCount)", label: "Findings", systemImage: "exclamationmark.bubble")
                }
                metric(value: "\(detail.lineage.count)", label: "Runs", systemImage: "timeline.selection")
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        .accessibilityIdentifier("review-detail-header-\(detail.review.id)")
    }

    private func bannerCard(_ banner: ReviewRunBanner) -> some View {
        Label {
            VStack(alignment: .leading, spacing: 3) {
                Text(banner.title)
                    .font(.subheadline.weight(.semibold))
                Text(banner.body)
                    .font(.caption)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } icon: {
            Image(systemName: banner.iconName)
                .foregroundStyle(banner.tint)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(banner.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
    }

    private func sectionCard<Content: View>(
        title: String,
        systemImage: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: systemImage)
                .font(.headline)
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private func detailRows(_ rows: [(String, String)]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(rows.enumerated()), id: \.offset) { row in
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.element.0)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text(row.element.1.isEmpty ? "Not recorded" : row.element.1)
                        .font(.caption.monospaced())
                        .lineLimit(3)
                        .textSelection(.enabled)
                }
            }
        }
    }

    private func lineageRow(_ item: ReviewRunLineageItem) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: item.active ? "largecircle.fill.circle" : item.status.iconName)
                .foregroundStyle(item.active ? IssueCTLColors.action : item.status.tint)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(item.label)
                        .font(.subheadline.weight(.semibold))
                    if item.active {
                        Text("current")
                            .font(.caption.bold())
                            .foregroundStyle(IssueCTLColors.action)
                    }
                }
                Text(item.summary ?? item.status.displayName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(item.completedAtIso ?? item.startedAtIso ?? "")
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private func findingRow(_ finding: ReviewRunFinding) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(finding.title)
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if let severity = finding.severity, !severity.isEmpty {
                    Text(severity.uppercased())
                        .font(.caption2.bold())
                        .foregroundStyle(.orange)
                }
            }
            if let location = finding.locationLabel {
                Text(location)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
            if let body = finding.body, !body.isEmpty {
                Text(body)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }
            if let htmlUrl = finding.htmlUrl {
                linkButton(title: "Open Finding", systemImage: "arrow.up.forward", urlString: htmlUrl)
                    .controlSize(.small)
            }
        }
        .padding(10)
        .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private func metric(value: String, label: String, systemImage: String) -> some View {
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

    private func linkButton(title: String, systemImage: String, urlString: String) -> some View {
        Button {
            if let url = URL(string: urlString) {
                openURL(url)
            }
        } label: {
            Label(title, systemImage: systemImage)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.bordered)
        .disabled(URL(string: urlString) == nil)
    }

    private func unavailableState(_ message: String) -> some View {
        ContentUnavailableView {
            Label("Review Unavailable", systemImage: "eye.slash")
        } description: {
            Text(message)
        } actions: {
            Button("Retry") {
                Task { await load(force: true) }
            }
        }
        .frame(maxWidth: .infinity, minHeight: 260)
    }

    @MainActor
    private func load(force: Bool = false) async {
        guard force || detail == nil else { return }
        isLoading = true
        errorMessage = nil
        do {
            detail = try await api.reviewRunDetail(id: reviewId)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    @MainActor
    private func requestAction(_ mode: ReviewRunActionMode) async {
        actionInFlight = mode
        errorMessage = nil
        do {
            _ = try await api.requestReviewRunAction(id: reviewId, mode: mode)
            detail = nil
            await load(force: true)
        } catch {
            errorMessage = error.localizedDescription
        }
        actionInFlight = nil
    }
}

private extension ReviewRunBanner {
    var tint: Color {
        switch tone {
        case .bad: .red
        case .warn: .orange
        case .info: IssueCTLColors.action
        }
    }

    var iconName: String {
        switch tone {
        case .bad: "exclamationmark.triangle.fill"
        case .warn: "exclamationmark.circle.fill"
        case .info: "info.circle.fill"
        }
    }
}

private struct ReviewRunDetailDiagnosticsSummaryCard: View {
    let response: DeploymentDiagnosticsResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: response.hasFailure ? "exclamationmark.triangle" : "checkmark.circle")
                    .foregroundStyle(response.hasFailure ? Color.orange : Color.green)
                Text(response.summaryText)
                    .font(.subheadline.weight(.semibold))
                Spacer(minLength: 0)
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 8) {
                ForEach(Array(response.summaryRows.enumerated()), id: \.offset) { row in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.element.0)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(row.element.1)
                            .font(.caption.monospaced())
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
    }
}

private struct ReviewRunDetailDiagnosticEventCard: View {
    let event: DiagnosticEvent

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(event.level.rawValue.uppercased())
                    .font(.caption2.bold())
                    .foregroundStyle(event.isFailure ? Color.red : Color.secondary)
                Text(event.event)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            if let message = event.message, !message.isEmpty {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(event.timestampIso ?? "\(event.timestamp)")
                .font(.caption2.monospaced())
                .foregroundStyle(.secondary)
        }
        .padding(10)
        .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}
