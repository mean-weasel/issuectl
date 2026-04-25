import SwiftUI

struct SessionListView: View {
    @Environment(APIClient.self) private var api
    @State private var deployments: [ActiveDeployment] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var terminalTarget: ActiveDeployment?
    @State private var endingDeploymentId: Int?

    private let refreshTimer = Timer.publish(every: 10, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationStack {
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
                    List {
                        ForEach(deployments) { deployment in
                            SessionRowView(deployment: deployment)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    if deployment.ttydPort != nil {
                                        terminalTarget = deployment
                                    }
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button(role: .destructive) {
                                        Task { await endSession(deployment) }
                                    } label: {
                                        Label("End", systemImage: "stop.circle")
                                    }
                                    .disabled(endingDeploymentId == deployment.id)
                                }
                        }
                    }
                    .refreshable { await load() }
                }
            }
            .navigationTitle("Active Sessions")
            .task { await load() }
            .onReceive(refreshTimer) { _ in
                Task { await load() }
            }
            .fullScreenCover(item: $terminalTarget) { deployment in
                if let port = deployment.ttydPort {
                    TerminalView(
                        deployment: deployment,
                        port: port,
                        onEnd: {
                            terminalTarget = nil
                            Task { await endSession(deployment) }
                        }
                    )
                }
            }
        }
    }

    private func load() async {
        if deployments.isEmpty { isLoading = true }
        errorMessage = nil
        do {
            let response = try await api.activeDeployments()
            deployments = response.deployments
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
