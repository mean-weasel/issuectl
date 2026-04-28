import Foundation

struct GitHubPull: Codable, Identifiable, Sendable {
    let number: Int
    let title: String
    let body: String?
    let state: String
    let merged: Bool
    let user: GitHubUser?
    let headRef: String
    let baseRef: String
    let additions: Int
    let deletions: Int
    let changedFiles: Int
    let createdAt: String
    let updatedAt: String
    let mergedAt: String?
    let closedAt: String?
    let htmlUrl: String
    let checksStatus: String?

    /// Use htmlUrl as the stable ID — PR numbers are only unique per-repo,
    /// so using `number` would collide when multiple repos are shown together.
    var id: String { htmlUrl }

    var isOpen: Bool { state == "open" }

    var diffSummary: String {
        "+\(additions) -\(deletions)"
    }
}

struct GitHubCheck: Codable, Identifiable, Sendable {
    let name: String
    let status: String
    let conclusion: String?
    let startedAt: String?
    let completedAt: String?
    let htmlUrl: String?

    var id: String { name }

    var isPassing: Bool { conclusion == "success" }
    var isFailing: Bool { conclusion == "failure" }
    var isPending: Bool { status != "completed" }
}

struct GitHubPullFile: Codable, Identifiable, Sendable {
    let filename: String
    let status: String
    let additions: Int
    let deletions: Int

    var id: String { filename }
}

struct GitHubPullReview: Codable, Identifiable, Sendable {
    let id: Int
    let user: GitHubUser?
    let state: String
    let body: String
    let submittedAt: String?

    var isApproved: Bool { state == "approved" }
    var isChangesRequested: Bool { state == "changes_requested" }
    var isCommented: Bool { state == "commented" }
}

struct PullsResponse: Codable, Sendable {
    let pulls: [GitHubPull]
    let fromCache: Bool
    let cachedAt: String?
}

struct PullDetailResponse: Codable, Sendable {
    let pull: GitHubPull
    let checks: [GitHubCheck]
    let files: [GitHubPullFile]
    let linkedIssue: GitHubIssue?
    let reviews: [GitHubPullReview]
    let fromCache: Bool
    let cachedAt: String?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        pull = try container.decode(GitHubPull.self, forKey: .pull)
        checks = try container.decode([GitHubCheck].self, forKey: .checks)
        files = try container.decode([GitHubPullFile].self, forKey: .files)
        linkedIssue = try container.decodeIfPresent(GitHubIssue.self, forKey: .linkedIssue)
        reviews = try container.decodeIfPresent([GitHubPullReview].self, forKey: .reviews) ?? []
        fromCache = try container.decode(Bool.self, forKey: .fromCache)
        cachedAt = try container.decodeIfPresent(String.self, forKey: .cachedAt)
    }

    private enum CodingKeys: String, CodingKey {
        case pull, checks, files, linkedIssue, reviews, fromCache, cachedAt
    }
}

struct MergeRequestBody: Encodable, Sendable {
    let mergeMethod: String
}

struct MergeResponse: Codable, Sendable {
    let success: Bool
    let sha: String?
    let error: String?
}

struct ReviewRequestBody: Encodable, Sendable {
    let event: String
    let body: String?
}

struct ReviewResponse: Codable, Sendable {
    let success: Bool
    let reviewId: Int?
    let error: String?
}

struct PullCommentRequestBody: Encodable, Sendable {
    let body: String
}

struct PullCommentResponse: Codable, Sendable {
    let success: Bool
    let commentId: Int?
    let error: String?
}
