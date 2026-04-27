import SwiftUI

struct WorktreeListView: View {
    @Environment(APIClient.self) private var api
    @State private var worktrees: [WorktreeInfo] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var actionError: String?
    @State private var isCleaningStale = false
    @State private var cleaningPath: String?

    var body: some View {
        Group {
            if isLoading && worktrees.isEmpty {
                ProgressView("Loading worktrees...")
            } else if let errorMessage {
                ContentUnavailableView {
                    Label("Error", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button("Retry") { Task { await load() } }
                }
            } else if worktrees.isEmpty {
                ContentUnavailableView(
                    "No Worktrees",
                    systemImage: "folder",
                    description: Text("No git worktrees found.")
                )
            } else {
                List {
                    if let actionError {
                        Label(actionError, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .font(.subheadline)
                            .lineLimit(3)
                    }

                    let staleCount = worktrees.filter(\.stale).count
                    if staleCount > 0 {
                        Section {
                            Button {
                                Task { await cleanupStale() }
                            } label: {
                                HStack {
                                    Label("Clean Up \(staleCount) Stale", systemImage: "trash")
                                    if isCleaningStale {
                                        Spacer()
                                        ProgressView()
                                    }
                                }
                            }
                            .disabled(isCleaningStale)
                        }
                    }

                    Section {
                        ForEach(worktrees) { worktree in
                            WorktreeRow(
                                worktree: worktree,
                                isCleaning: cleaningPath == worktree.path
                            )
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    Task { await cleanup(path: worktree.path) }
                                } label: {
                                    Label("Remove", systemImage: "trash")
                                }
                                .disabled(cleaningPath != nil)
                            }
                        }
                    } header: {
                        Text("\(worktrees.count) Worktree\(worktrees.count == 1 ? "" : "s")")
                    }
                }
                .refreshable { await load() }
            }
        }
        .navigationTitle("Worktrees")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
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
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(worktree.name)
                    .font(.body)
                if worktree.stale {
                    Text("Stale")
                        .font(.caption2.weight(.medium))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.orange.opacity(0.15))
                        .foregroundStyle(.orange)
                        .clipShape(Capsule())
                }
                if isCleaning {
                    Spacer()
                    ProgressView()
                }
            }
            if let repoName = worktree.repoFullName {
                HStack(spacing: 4) {
                    Image(systemName: "arrow.triangle.branch")
                        .font(.caption2)
                    Text(repoName)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            if let issueNumber = worktree.issueNumber {
                HStack(spacing: 4) {
                    Image(systemName: "number")
                        .font(.caption2)
                    Text("Issue #\(issueNumber)")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Text(worktree.path)
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .padding(.vertical, 2)
    }
}
