import SwiftUI

struct MacSessionsView: View {
    @Environment(APIClient.self) private var api
    @Environment(\.openURL) private var openURL

    let store: MacSidebarStore

    @State private var endingSessionId: Int?
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            controls

            if store.isLoading && store.sessions.isEmpty {
                ProgressView("Loading sessions...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.sessions.isEmpty {
                ContentUnavailableView("No Active Sessions", systemImage: "terminal", description: Text("Launch an issue to start an agent session."))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(store.sessions) { session in
                    sessionRow(session)
                }
                .listStyle(.plain)
            }
        }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(store.sessions.count) active")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button {
                    Task { await store.refreshSessions(api: api) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.borderless)
                .help("Refresh sessions")
            }

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
    }

    private func sessionRow(_ session: ActiveDeployment) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(session.repoFullName) #\(session.issueNumber)")
                        .font(.subheadline.weight(.medium))
                    Text(session.branchName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Text(session.runningDuration)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if !session.workspacePath.isEmpty {
                Text(session.workspacePath)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }

            HStack(spacing: 8) {
                Label(session.ttydPort == nil ? "Starting" : "Ready", systemImage: session.ttydPort == nil ? "hourglass" : "terminal")
                    .font(.caption)
                    .foregroundStyle(session.ttydPort == nil ? .orange : .green)

                Spacer()

                Button {
                    openTerminal(session)
                } label: {
                    Label("Open", systemImage: "terminal")
                }
                .buttonStyle(.bordered)
                .disabled(session.ttydPort == nil)

                Button(role: .destructive) {
                    Task { await endSession(session) }
                } label: {
                    if endingSessionId == session.id {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label("End", systemImage: "stop.circle")
                    }
                }
                .buttonStyle(.bordered)
                .disabled(endingSessionId != nil)
            }
        }
        .padding(.vertical, 6)
    }

    private func openTerminal(_ session: ActiveDeployment) {
        Task {
            errorMessage = nil
            do {
                let url = try await store.terminalURL(api: api, session: session)
                openURL(url)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func endSession(_ session: ActiveDeployment) async {
        endingSessionId = session.id
        errorMessage = nil
        defer { endingSessionId = nil }

        do {
            try await store.endSession(api: api, session: session)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
