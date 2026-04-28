import SwiftUI

struct CommentView: View {
    let comment: GitHubComment

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
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
                }

                Spacer()

                Text(comment.timeAgo)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }

            Text(comment.body)
                .font(.body)
                .textSelection(.enabled)
        }
        .padding(.vertical, 4)
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
