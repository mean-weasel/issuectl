import SwiftUI

struct SessionListView: View {
    @Environment(APIClient.self) private var api
    @State private var repos: [Repo] = []
    @State private var deployments: [ActiveDeployment] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var actionError: String?
    @State private var terminalTarget: ActiveDeployment?
    @State private var sessionControlsTarget: ActiveDeployment?
    @State private var showCreateSheet = false
    @State private var endingDeploymentId: Int?
    @State private var navigationPath = NavigationPath()

    private let refreshTimer = Timer.publish(every: 10, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationStack(path: $navigationPath) {
            VStack(spacing: 0) {
                Group {
                    if isLoading && deployments.isEmpty {
                        ProgressView("Loading sessions...")
                    } else if let errorMessage {
                        ContentUnavailableView {
                            Label("Error", systemImage: "exclamationmark.triangle")
                        } description: {
                            Text(errorMessage)
                        } actions: {
                            Button("Retry") { Task { await load() } }
                        }
                    } else if deployments.isEmpty {
                        ContentUnavailableView(
                            "No Active Sessions",
                            systemImage: "play.circle",
                            description: Text("Launch a Claude Code session from an issue to see it here.")
                        )
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 12) {
                                if let actionError {
                                    Label(actionError, systemImage: "exclamationmark.triangle")
                                        .foregroundStyle(.red)
                                        .font(.subheadline)
                                        .lineLimit(3)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }

                                ForEach(deployments) { deployment in
                                    SessionRowView(
                                        deployment: deployment,
                                        isEnding: endingDeploymentId == deployment.id,
                                        onOpen: {
                                            if deployment.ttydPort != nil {
                                                terminalTarget = deployment
                                            }
                                        },
                                        onControls: {
                                            sessionControlsTarget = deployment
                                        }
                                    )
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.top, 16)
                            .padding(.bottom, 16)
                        }
                        .refreshable { await load(refresh: true) }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                sessionThumbBar
            }
            .navigationTitle("Active Sessions")
            .navigationDestination(for: IssueDestination.self) { dest in
                IssueDetailView(owner: dest.owner, repo: dest.repo, number: dest.number)
            }
            .task { await load() }
            .onReceive(refreshTimer) { _ in
                Task { await load() }
            }
            .autoDismissError($actionError)
            .interactivePopDisabled(isAtRoot: navigationPath.isEmpty)
            .fullScreenCover(item: $terminalTarget) { deployment in
                if let port = deployment.ttydPort {
                    TerminalView(
                        deployment: deployment,
                        port: port,
                        onEnd: {
                            terminalTarget = nil
                            deployments.removeAll { $0.id == deployment.id }
                        }
                    )
                }
            }
            .sheet(item: $sessionControlsTarget) { deployment in
                SessionControlsSheet(
                    deployment: deployment,
                    isEnding: endingDeploymentId == deployment.id,
                    onOpenTerminal: {
                        sessionControlsTarget = nil
                        if deployment.ttydPort != nil {
                            terminalTarget = deployment
                        }
                    },
                    onViewIssue: {
                        sessionControlsTarget = nil
                        navigationPath.append(IssueDestination(
                            owner: deployment.owner,
                            repo: deployment.repoName,
                            number: deployment.issueNumber
                        ))
                    },
                    onEnd: {
                        Task {
                            await endSession(deployment)
                            sessionControlsTarget = nil
                        }
                    }
                )
                .presentationDetents([.height(330), .medium])
                .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showCreateSheet) {
                QuickCreateSheet(repos: repos, onSuccess: { warning in
                    if let warning { actionError = warning }
                    Task { await load(refresh: true) }
                })
            }
        }
    }

    private var sessionThumbBar: some View {
        ThumbActionBar {
            Button {
                showCreateSheet = true
            } label: {
                Label("Create Issue", systemImage: "plus")
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(IssueCTLColors.action)
            .accessibilityIdentifier("sessions-create-issue-button")
        } secondary: {
            EmptyView()
        }
        .padding(.bottom, 14)
    }

    private func load(refresh: Bool = false) async {
        if deployments.isEmpty { isLoading = true }
        errorMessage = nil
        if refresh { actionError = nil }
        do {
            async let deploymentsResult = api.activeDeployments()
            async let reposResult: Result<[Repo], Error> = {
                do { return .success(try await api.repos()) }
                catch { return .failure(error) }
            }()
            let response = try await deploymentsResult
            deployments = response.deployments
            switch await reposResult {
            case .success(let loadedRepos):
                repos = loadedRepos
            case .failure(let error):
                if repos.isEmpty {
                    actionError = "Failed to load repos for create: \(error.localizedDescription)"
                }
            }
        } catch {
            if deployments.isEmpty {
                errorMessage = error.localizedDescription
            }
        }
        isLoading = false
    }

    private func endSession(_ deployment: ActiveDeployment) async {
        endingDeploymentId = deployment.id
        do {
            _ = try await api.endSession(
                deploymentId: deployment.id,
                owner: deployment.owner,
                repo: deployment.repoName,
                issueNumber: deployment.issueNumber
            )
            deployments.removeAll { $0.id == deployment.id }
        } catch {
            errorMessage = error.localizedDescription
        }
        endingDeploymentId = nil
    }
}

private struct SessionControlsSheet: View {
    let deployment: ActiveDeployment
    let isEnding: Bool
    let onOpenTerminal: () -> Void
    let onViewIssue: () -> Void
    let onEnd: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text("#\(deployment.issueNumber) Session")
                    .font(.title2.weight(.bold))
                Text(deployment.repoFullName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 0) {
                sheetAction(
                    title: "Open Terminal",
                    subtitle: deployment.ttydPort.map { "Port \($0)" } ?? "Terminal is still preparing.",
                    systemImage: "terminal",
                    isDisabled: deployment.ttydPort == nil,
                    action: onOpenTerminal
                )

                Divider()

                sheetAction(
                    title: "View Issue",
                    subtitle: "Jump to #\(deployment.issueNumber) without losing this session.",
                    systemImage: "number",
                    action: onViewIssue
                )

                Divider()

                Button(role: .destructive, action: onEnd) {
                    HStack(spacing: 12) {
                        Image(systemName: "stop.circle")
                            .frame(width: 26)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(isEnding ? "Ending Session" : "End Session")
                                .font(.subheadline.weight(.semibold))
                            Text("Stop ttyd and mark deployment ended.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if isEnding {
                            ProgressView()
                                .controlSize(.small)
                        }
                    }
                    .padding(12)
                }
                .disabled(isEnding)
            }
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))

            Spacer(minLength: 0)
        }
        .padding(16)
    }

    private func sheetAction(
        title: String,
        subtitle: String,
        systemImage: String,
        isDisabled: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .frame(width: 26)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tertiary)
            }
            .padding(12)
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.55 : 1)
    }
}
