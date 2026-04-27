import SwiftUI

struct PRRowView: View {
    let pull: GitHubPull
    var repoColor: Color = .secondary

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(repoColor)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text("#\(pull.number)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(pull.title)
                        .font(.body)
                        .lineLimit(2)
                }

                HStack(spacing: 8) {
                    PRStateBadge(pull: pull)

                    ChecksStatusDot(status: pull.checksStatus)

                    Text(pull.diffSummary)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Spacer()

                    if let user = pull.user {
                        Text(user.login)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Text(pull.timeAgo)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

struct PRStateBadge: View {
    let pull: GitHubPull

    private var label: String {
        if pull.merged { return "Merged" }
        return pull.isOpen ? "Open" : "Closed"
    }

    private var icon: String {
        if pull.merged { return "checkmark.circle.fill" }
        return pull.isOpen ? "arrow.triangle.merge" : "xmark.circle"
    }

    private var color: Color {
        if pull.merged { return .purple }
        return pull.isOpen ? .green : .red
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
            Text(label)
        }
        .font(.caption2.weight(.medium))
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(color.opacity(0.15))
        .foregroundStyle(color)
        .clipShape(Capsule())
    }
}

struct ChecksStatusDot: View {
    let status: String?

    private var color: Color {
        switch status {
        case "success": return .green
        case "failure": return .red
        case "pending": return .yellow
        default: return .gray
        }
    }

    private var accessibilityLabel: String {
        switch status {
        case "success": return "CI passing"
        case "failure": return "CI failing"
        case "pending": return "CI pending"
        default: return "CI status unknown"
        }
    }

    var body: some View {
        if status != nil {
            Image(systemName: "circle.fill")
                .font(.system(size: 7))
                .foregroundStyle(color)
                .accessibilityLabel(accessibilityLabel)
        }
    }
}

private extension GitHubPull {
    var updatedDate: Date? {
        ISO8601DateFormatter().date(from: updatedAt)
    }

    var timeAgo: String {
        guard let date = updatedDate else { return "" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
