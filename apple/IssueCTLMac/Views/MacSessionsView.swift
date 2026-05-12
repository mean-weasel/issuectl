import SwiftUI

struct MacSessionsView: View {
    let store: MacSidebarStore

    var body: some View {
        Group {
            if store.isLoading && store.sessions.isEmpty {
                ProgressView("Loading sessions...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.sessions.isEmpty {
                ContentUnavailableView("No Active Sessions", systemImage: "terminal", description: Text("Launch an issue to start an agent session."))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(store.sessions) { session in
                    VStack(alignment: .leading, spacing: 5) {
                        HStack {
                            Text("\(session.repoFullName) #\(session.issueNumber)")
                                .font(.subheadline.weight(.medium))
                            Spacer()
                            Text(session.runningDuration)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Text(session.branchName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Text(session.workspacePath)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .lineLimit(1)
                    }
                    .padding(.vertical, 5)
                }
                .listStyle(.plain)
            }
        }
    }
}
