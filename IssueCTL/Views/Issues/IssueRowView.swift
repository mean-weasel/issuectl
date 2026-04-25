import SwiftUI

struct IssueRowView: View {
    let issue: GitHubIssue

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text("#\(issue.number)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(issue.title)
                    .font(.body)
                    .lineLimit(2)
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

private extension Color {
    init?(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard hex.count == 6,
              let int = UInt64(hex, radix: 16) else { return nil }
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8) & 0xFF) / 255
        let b = Double(int & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
