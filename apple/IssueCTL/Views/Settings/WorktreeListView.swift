import SwiftUI

struct WorktreeListView: View {
    @Environment(APIClient.self) private var api
    @State private var worktrees: [WorktreeInfo] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var actionError: String?
    @State private var isCleaningStale = false
    @State private var cleaningPath: String?
    @State private var cleanupTarget: WorktreeInfo?
    @State private var showCleanupStaleConfirm = false

    private var staleWorktrees: [WorktreeInfo] {
        worktrees.filter(\.stale)
    }

    private var activeWorktrees: [WorktreeInfo] {
        worktrees.filter { !$0.stale }
    }

    var body: some View {
        Group {
            if isLoading && worktrees.isEmpty {
                ProgressView("Checking worktrees...")
            } else if let errorMessage {
                ContentUnavailableView {
                    Label("Worktrees Unavailable", systemImage: "exclamationmark.triangle")
                } description: {
                    Text("issuectl could not load the current worktree list. \(errorMessage)")
                } actions: {
                    Button {
                        Task { await load() }
                    } label: {
                        Label("Retry", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(.borderedProminent)
                }
            } else if worktrees.isEmpty {
                ContentUnavailableView {
                    Label("No Worktrees", systemImage: "folder")
                } description: {
                    Text("No active or stale git worktrees were found for tracked repositories.")
                } actions: {
                    Button {
                        Task { await load() }
                    } label: {
                        Label("Check Again", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(.bordered)
                }
            } else {
                List {
                    if let actionError {
                        Section {
                            Label(actionError, systemImage: "exclamationmark.triangle")
                                .foregroundStyle(.red)
                                .font(.subheadline)
                                .lineLimit(3)
                        }
                    }

                    Section {
                        WorktreeSummaryCard(
                            totalCount: worktrees.count,
                            activeCount: activeWorktrees.count,
                            staleCount: staleWorktrees.count
                        )
                    }
                    .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
                    .listRowBackground(Color.clear)

                    if !staleWorktrees.isEmpty {
                        staleSection
                    }

                    if !activeWorktrees.isEmpty {
                        worktreeSection(
                            title: "Active",
                            worktrees: activeWorktrees,
                            footer: "Active worktrees may be backing current sessions. Review before cleaning up."
                        )
                    }
                }
                .refreshable { await load() }
            }
        }
        .navigationTitle("Worktrees")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(
            "Clean Up Stale Worktrees?",
            isPresented: $showCleanupStaleConfirm,
            titleVisibility: .visible
        ) {
            Button("Clean Up \(staleWorktrees.count) Stale", role: .destructive) {
                Task { await cleanupStale() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes worktree records that no longer point to usable local directories.")
        }
        .confirmationDialog(
            "Clean Up Worktree?",
            isPresented: Binding(
                get: { cleanupTarget != nil },
                set: { if !$0 { cleanupTarget = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Clean Up Worktree", role: .destructive) {
                if let cleanupTarget {
                    Task { await cleanup(path: cleanupTarget.path) }
                }
                cleanupTarget = nil
            }
            Button("Cancel", role: .cancel) {
                cleanupTarget = nil
            }
        } message: {
            Text(cleanupTarget?.cleanupConfirmationMessage ?? "Remove this worktree from issuectl.")
        }
        .task { await load() }
    }

    private var staleSection: some View {
        Section {
            Button {
                showCleanupStaleConfirm = true
            } label: {
                HStack(spacing: 10) {
                    Label("Clean Up Stale Worktrees", systemImage: "trash")
                        .font(.subheadline.weight(.semibold))
                    Spacer(minLength: 8)
                    Text("\(staleWorktrees.count)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Color.orange.opacity(0.12), in: Capsule())
                    if isCleaningStale {
                        ProgressView()
                    }
                }
            }
            .disabled(isCleaningStale || cleaningPath != nil)

            ForEach(staleWorktrees) { worktree in
                worktreeRow(worktree)
            }
        } header: {
            Text("Needs Cleanup")
        } footer: {
            Text("Stale worktrees are missing or no longer usable. Cleanup removes their worktree entry, not issue history.")
        }
    }

    private func worktreeSection(title: String, worktrees: [WorktreeInfo], footer: String) -> some View {
        Section {
            ForEach(worktrees) { worktree in
                worktreeRow(worktree)
            }
        } header: {
            Text("\(title) (\(worktrees.count))")
        } footer: {
            Text(footer)
        }
    }

    private func worktreeRow(_ worktree: WorktreeInfo) -> some View {
        WorktreeRow(
            worktree: worktree,
            isCleaning: cleaningPath == worktree.path
        )
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                cleanupTarget = worktree
            } label: {
                Label("Clean Up", systemImage: "trash")
            }
            .disabled(cleaningPath != nil || isCleaningStale)
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        actionError = nil
        do {
            worktrees = try await api.listWorktrees()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func cleanup(path: String) async {
        cleaningPath = path
        actionError = nil
        do {
            let response = try await api.cleanupWorktree(path: path)
            if response.success {
                worktrees.removeAll { $0.path == path }
            } else {
                actionError = response.error ?? "Failed to remove worktree"
            }
        } catch {
            actionError = error.localizedDescription
        }
        cleaningPath = nil
    }

    private func cleanupStale() async {
        isCleaningStale = true
        actionError = nil
        do {
            let response = try await api.cleanupStaleWorktrees()
            if response.success {
                await load()
            } else {
                actionError = response.error ?? "Failed to clean up stale worktrees"
            }
        } catch {
            actionError = error.localizedDescription
        }
        isCleaningStale = false
    }
}

private struct WorktreeRow: View {
    let worktree: WorktreeInfo
    let isCleaning: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: worktree.stale ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(worktree.stale ? .orange : .green)
                .frame(width: 32, height: 32)
                .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .firstTextBaseline) {
                    Text(worktree.name)
                        .font(.body.weight(.semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)

                    Spacer(minLength: 8)

                    WorktreeStatusPill(
                        title: worktree.stale ? "Stale" : "Active",
                        systemImage: worktree.stale ? "exclamationmark.circle" : "checkmark.circle.fill",
                        tint: worktree.stale ? .orange : .green
                    )
                }

                if let repoName = worktree.repoFullName {
                    metadataLabel(repoName, systemImage: "arrow.triangle.branch")
                }

                if let issueNumber = worktree.issueNumber {
                    metadataLabel("Issue #\(issueNumber)", systemImage: "number")
                }

                metadataLabel(worktree.path, systemImage: "externaldrive")
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            if isCleaning {
                ProgressView()
                    .padding(.top, 6)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
    }

    private func metadataLabel(_ title: String, systemImage: String) -> some View {
        Label {
            Text(title)
        } icon: {
            Image(systemName: systemImage)
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    private var accessibilityLabel: String {
        var parts = [worktree.name, worktree.stale ? "stale" : "active"]
        if let repoName = worktree.repoFullName {
            parts.append(repoName)
        }
        if let issueNumber = worktree.issueNumber {
            parts.append("issue \(issueNumber)")
        }
        return parts.joined(separator: ", ")
    }
}

private struct WorktreeSummaryCard: View {
    let totalCount: Int
    let activeCount: Int
    let staleCount: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: staleCount > 0 ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(staleCount > 0 ? .orange : .green)
                    .frame(width: 38, height: 38)
                    .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10))

                VStack(alignment: .leading, spacing: 4) {
                    Text(staleCount > 0 ? "Cleanup Available" : "Worktrees Clear")
                        .font(.headline)
                    Text(summaryText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 8)
            }

            HStack(spacing: 8) {
                WorktreeSummaryMetric(title: "Total", value: "\(totalCount)", systemImage: "folder")
                WorktreeSummaryMetric(title: "Active", value: "\(activeCount)", systemImage: "checkmark.circle")
                WorktreeSummaryMetric(title: "Stale", value: "\(staleCount)", systemImage: "exclamationmark.circle")
            }
        }
        .padding(14)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
        .accessibilityElement(children: .contain)
    }

    private var summaryText: String {
        if staleCount == 0 {
            return "No stale worktrees were found in the current scan."
        }
        return "\(staleCount) stale worktree\(staleCount == 1 ? "" : "s") can be reviewed and cleaned up."
    }
}

private struct WorktreeSummaryMetric: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(title, systemImage: systemImage)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .labelStyle(.titleAndIcon)
            Text(value)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 8))
    }
}

private struct WorktreeStatusPill: View {
    let title: String
    let systemImage: String
    let tint: Color

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.caption2.weight(.semibold))
            .labelStyle(.titleAndIcon)
            .lineLimit(1)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .foregroundStyle(tint)
            .background(tint.opacity(0.12), in: Capsule())
    }
}

private extension WorktreeInfo {
    var cleanupConfirmationMessage: String {
        let issue = issueNumber.map { " for issue #\($0)" } ?? ""
        return "This removes the worktree entry\(issue). Confirm the directory is no longer needed before continuing."
    }
}
