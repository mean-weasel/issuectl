import Foundation

/// Shared ISO 8601 date formatter — allocated once, reused everywhere.
/// Must live at file scope so models, views, and extensions can reference it.
let sharedISO8601Formatter: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()

struct GitHubUser: Codable, Sendable {
    let login: String
    let avatarUrl: String
}

struct GitHubLabel: Codable, Identifiable, Sendable {
    let name: String
    let color: String
    let description: String?

    var id: String { name }
}

struct GitHubIssue: Codable, Identifiable, Sendable {
    let number: Int
    let title: String
    let body: String?
    let state: String
    let labels: [GitHubLabel]
    let assignees: [GitHubUser]?
    let user: GitHubUser?
    let commentCount: Int
    let createdAt: String
    let updatedAt: String
    let closedAt: String?
    let htmlUrl: String

    /// Use htmlUrl as the stable ID — issue numbers are only unique per-repo,
    /// so using `number` would collide when multiple repos are shown together.
    var id: String { htmlUrl }

    var isOpen: Bool { state == "open" }

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

struct GitHubComment: Codable, Identifiable, Sendable {
    let id: Int
    let body: String
    let user: GitHubUser?
    let createdAt: String
    let updatedAt: String
    let htmlUrl: String
}

struct IssuesResponse: Codable, Sendable {
    let issues: [GitHubIssue]
    let fromCache: Bool
    let cachedAt: String?
}

struct IssueDetailResponse: Codable, Sendable {
    let issue: GitHubIssue
    let comments: [GitHubComment]
    let deployments: [Deployment]
    let linkedPRs: [GitHubPull]
    let referencedFiles: [String]
    let fromCache: Bool
}

struct IssueStateRequestBody: Encodable, Sendable {
    let state: String // "open" or "closed"
    let comment: String?
}

struct IssueStateResponse: Codable, Sendable {
    let success: Bool
    let commentPosted: Bool?
    let error: String?
}

struct IssueCommentRequestBody: Encodable, Sendable {
    let body: String
}

struct IssueCommentResponse: Codable, Sendable {
    let success: Bool
    let commentId: Int?
    let error: String?
}

// MARK: - Drafts

struct Draft: Codable, Identifiable, Sendable {
    let id: String
    let title: String
    let body: String?
    let priority: Priority?
    let createdAt: Double // unix timestamp from server
}

struct DraftsResponse: Codable, Sendable {
    let drafts: [Draft]
}

struct CreateDraftRequestBody: Encodable, Sendable {
    let title: String
    let body: String?
    let priority: Priority?
}

struct CreateDraftResponse: Codable, Sendable {
    let success: Bool
    let id: String?
    let error: String?
}

struct AssignDraftRequestBody: Encodable, Sendable {
    let repoId: Int
}

struct AssignDraftResponse: Codable, Sendable {
    let success: Bool
    let issueNumber: Int?
    let issueUrl: String?
    let cleanupWarning: String?
    let labelsWarning: String?
    let error: String?
}

struct SuccessResponse: Codable, Sendable {
    let success: Bool
    let error: String?
}
