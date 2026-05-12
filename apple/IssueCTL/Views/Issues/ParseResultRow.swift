import SwiftUI

struct ParseResultRow: View {
    let issue: ParsedIssue
    let repos: [Repo]
    let isAccepted: Bool
    let onToggleAccepted: () -> Void
    let selectedRepo: (owner: String, name: String)?
    let onSelectRepo: (String, String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(issue.title)
                        .font(.body.weight(.medium))
                        .foregroundStyle(isAccepted ? .primary : .secondary)
                        .strikethrough(!isAccepted)

                    if !issue.body.isEmpty {
                        Text(issue.body)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }

                Spacer()

                Button {
                    onToggleAccepted()
                } label: {
                    Image(systemName: isAccepted ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(isAccepted ? .green : .secondary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(isAccepted ? "Reject parsed issue" : "Accept parsed issue")
                .accessibilityIdentifier("parse-result-accept-toggle")
            }

            HStack(spacing: 8) {
                // Type badge
                Text(issue.type.capitalized)
                    .font(.caption2.weight(.medium))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(typeColor(issue.type).opacity(0.15))
                    .foregroundStyle(typeColor(issue.type))
                    .clipShape(Capsule())

                // Clarity indicator
                if issue.clarity != "clear" {
                    Label(issue.clarity == "ambiguous" ? "Ambiguous" : "Unknown repo",
                          systemImage: "exclamationmark.triangle.fill")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }

                // Labels
                ForEach(issue.suggestedLabels.prefix(3), id: \.self) { label in
                    Text(label)
                        .font(.caption2)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(Color.secondary.opacity(0.12))
                        .clipShape(Capsule())
                }
            }

            // Repo picker
            if isAccepted {
                Menu {
                    ForEach(repos) { repo in
                        Button {
                            onSelectRepo(repo.owner, repo.name)
                        } label: {
                            if selectedRepo?.owner == repo.owner && selectedRepo?.name == repo.name {
                                Label(repo.fullName, systemImage: "checkmark")
                            } else {
                                Text(repo.fullName)
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "folder")
                            .font(.caption2)
                        Text(selectedRepo.map { "\($0.owner)/\($0.name)" } ?? "Select repo...")
                            .font(.caption)
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.caption2)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.secondary.opacity(0.1))
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .foregroundStyle(selectedRepo != nil ? Color.primary : Color.orange)
            }
        }
        .padding(.vertical, 4)
        .opacity(isAccepted ? 1.0 : 0.6)
    }

    private func typeColor(_ type: String) -> Color {
        switch type {
        case "bug": .red
        case "feature": .blue
        case "enhancement": .green
        case "refactor": .purple
        case "docs": .orange
        case "chore": .secondary
        default: .secondary
        }
    }
}
