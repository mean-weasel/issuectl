import SwiftUI

struct IssueRowView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let issue: GitHubIssue
    var repoColor: Color = .secondary
    var isRunning: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            RoundedRectangle(cornerRadius: 4)
                .fill(repoColor)
                .frame(width: 6, height: dynamicTypeSize.isAccessibilitySize ? 52 : 38)
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 4) {
                Text(issue.title)
                    .font(.callout.weight(.semibold))
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 4 : 2)

                ViewThatFits(in: .horizontal) {
                    issueMetadata
                    VStack(alignment: .leading, spacing: 2) {
                        issueMetadata
                    }
                }
                .font(.caption)

                if !issue.labels.isEmpty {
                    ViewThatFits(in: .horizontal) {
                        labelRow
                        ScrollView(.horizontal, showsIndicators: false) {
                            labelRow
                        }
                    }
                    .lineLimit(1)
                }
            }
        }
        .padding(.vertical, dynamicTypeSize.isAccessibilitySize ? 8 : 5)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilitySummary)
    }

    private var issueMetadata: some View {
        HStack(spacing: 6) {
            Text("#\(issue.number)")
                .foregroundStyle(.secondary)
            if let user = issue.user {
                Text(user.login)
                    .foregroundStyle(.secondary)
            }
            Text(issue.timeAgo)
                .foregroundStyle(.tertiary)
            if isRunning {
                Label("Running", systemImage: "play.circle.fill")
                    .foregroundStyle(.green)
                    .labelStyle(.titleAndIcon)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.85)
    }

    private var labelRow: some View {
        HStack(spacing: 5) {
            ForEach(issue.labels.prefix(3)) { label in
                LabelBadge(label: label)
            }
            if issue.labels.count > 3 {
                Text("+\(issue.labels.count - 3)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var accessibilitySummary: String {
        var parts = ["Issue #\(issue.number)", issue.title]
        if let user = issue.user {
            parts.append("opened by \(user.login)")
        }
        if !issue.timeAgo.isEmpty {
            parts.append(issue.timeAgo)
        }
        if isRunning {
            parts.append("session running")
        }
        if !issue.labels.isEmpty {
            parts.append("labels: \(issue.labels.map(\.name).joined(separator: ", "))")
        }
        return parts.joined(separator: ", ")
    }
}

struct LabelBadge: View {
    let label: GitHubLabel

    var body: some View {
        Text(label.name)
            .font(.caption2.weight(.medium))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
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
