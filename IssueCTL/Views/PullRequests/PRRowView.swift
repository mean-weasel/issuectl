import SwiftUI

struct PRRowView: View {
    let pull: GitHubPull

    var body: some View {
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
