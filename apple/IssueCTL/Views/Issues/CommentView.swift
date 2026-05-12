import SwiftUI

struct CommentView: View {
    let comment: GitHubComment

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let user = comment.user {
                    AsyncImage(url: URL(string: user.avatarUrl)) { image in
                        image.resizable()
                    } placeholder: {
                        Circle().fill(.quaternary)
                    }
                    .frame(width: 28, height: 28)
                    .clipShape(Circle())

                    Text(user.login)
                        .font(.subheadline.weight(.medium))
                        .lineLimit(1)
                }

                Spacer()

                Text(comment.timeAgo)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }

            MarkdownView(content: comment.body)
        }
        .padding(12)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilitySummary)
    }

    private var accessibilitySummary: String {
        let author = comment.user?.login ?? "Unknown author"
        return "Comment by \(author), \(comment.timeAgo), \(comment.body)"
    }
}

private extension GitHubComment {
    var createdDate: Date? {
        sharedISO8601Formatter.date(from: createdAt)
    }

    var timeAgo: String {
        guard let date = createdDate else { return "" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
