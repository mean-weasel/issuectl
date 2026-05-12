import SwiftUI

struct PRRowView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let pull: GitHubPull
    var repoColor: Color = .secondary

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            RoundedRectangle(cornerRadius: 4)
                .fill(repoColor)
                .frame(width: 6, height: dynamicTypeSize.isAccessibilitySize ? 52 : 38)
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 4) {
                Text(pull.title)
                    .font(.callout.weight(.semibold))
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 4 : 2)

                ViewThatFits(in: .horizontal) {
                    pullMetadata
                    VStack(alignment: .leading, spacing: 2) {
                        pullMetadata
                    }
                }
                .font(.caption)

                HStack(spacing: 6) {
                    PRStateBadge(pull: pull)

                    ChecksStatusDot(status: pull.checksStatus)

                    if pull.checksStatus != nil {
                        Text(checksLabel)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(.vertical, dynamicTypeSize.isAccessibilitySize ? 8 : 5)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilitySummary)
    }

    private var checksLabel: String {
        switch pull.checksStatus {
        case "success": return "Passing"
        case "failure": return "Failing"
        case "pending": return "Pending"
        default: return "Unknown"
        }
    }

    private var pullMetadata: some View {
        HStack(spacing: 6) {
            Text("#\(pull.number)")
                .foregroundStyle(.secondary)
            if let user = pull.user {
                Text(user.login)
                    .foregroundStyle(.secondary)
            }
            Text(pull.timeAgo)
                .foregroundStyle(.tertiary)

            Text(pull.diffSummary)
                .foregroundStyle(.secondary)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.85)
    }

    private var accessibilitySummary: String {
        var parts = ["Pull request #\(pull.number)", pull.title]
        if let user = pull.user {
            parts.append("opened by \(user.login)")
        }
        if !pull.timeAgo.isEmpty {
            parts.append(pull.timeAgo)
        }
        parts.append(pull.diffSummary)
        if pull.checksStatus != nil {
            parts.append("checks \(checksLabel.lowercased())")
        }
        return parts.joined(separator: ", ")
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
        .font(.caption2.weight(.semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.8)
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
        sharedISO8601Formatter.date(from: updatedAt)
    }

    var timeAgo: String {
        guard let date = updatedDate else { return "" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
