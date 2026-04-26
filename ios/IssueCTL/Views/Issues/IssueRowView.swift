import SwiftUI

struct IssueRowView: View {
    let issue: GitHubIssue
    var repoColor: Color = .secondary
    var isRunning: Bool = false

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(repoColor)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text("#\(issue.number)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(issue.title)
                        .font(.body)
                        .lineLimit(2)
                    if isRunning {
                        Circle()
                            .fill(.green)
                            .frame(width: 6, height: 6)
                    }
                }

                HStack(spacing: 8) {
                    if !issue.labels.isEmpty {
                        HStack(spacing: 4) {
                            ForEach(issue.labels.prefix(3)) { label in
                                LabelBadge(label: label)
                            }
                            if issue.labels.count > 3 {
                                Text("+\(issue.labels.count - 3)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    Spacer()

                    if let user = issue.user {
                        Text(user.login)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Text(issue.timeAgo)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

struct LabelBadge: View {
    let label: GitHubLabel

    var body: some View {
        Text(label.name)
            .font(.caption2)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(labelColor.opacity(0.2))
            .foregroundStyle(labelColor)
            .clipShape(Capsule())
    }

    private var labelColor: Color {
        Color(hex: label.color) ?? .secondary
    }
}
