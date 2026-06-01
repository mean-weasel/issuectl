import Foundation

struct GitHubPull: Codable, Identifiable, Sendable {
    let number: Int
    let title: String
    let body: String?
    let state: String
    let draft: Bool?
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
    let labels: [GitHubLabel]

    /// Use htmlUrl as the stable ID — PR numbers are only unique per-repo,
    /// so using `number` would collide when multiple repos are shown together.
    var id: String { htmlUrl }

    var isDraft: Bool { draft ?? false }
    var isOpen: Bool { state == "open" }

    var diffSummary: String {
        "+\(additions) -\(deletions)"
    }

    init(
        number: Int,
        title: String,
        body: String?,
        state: String,
        draft: Bool?,
        merged: Bool,
        user: GitHubUser?,
        headRef: String,
        baseRef: String,
        additions: Int,
        deletions: Int,
        changedFiles: Int,
        createdAt: String,
        updatedAt: String,
        mergedAt: String?,
        closedAt: String?,
        htmlUrl: String,
        checksStatus: String?,
        labels: [GitHubLabel] = []
    ) {
        self.number = number
        self.title = title
        self.body = body
        self.state = state
        self.draft = draft
        self.merged = merged
        self.user = user
        self.headRef = headRef
        self.baseRef = baseRef
        self.additions = additions
        self.deletions = deletions
        self.changedFiles = changedFiles
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.mergedAt = mergedAt
        self.closedAt = closedAt
        self.htmlUrl = htmlUrl
        self.checksStatus = checksStatus
        self.labels = labels
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        number = try container.decode(Int.self, forKey: .number)
        title = try container.decode(String.self, forKey: .title)
        body = try container.decodeIfPresent(String.self, forKey: .body)
        state = try container.decode(String.self, forKey: .state)
        draft = try container.decodeIfPresent(Bool.self, forKey: .draft)
        merged = try container.decode(Bool.self, forKey: .merged)
        user = try container.decodeIfPresent(GitHubUser.self, forKey: .user)
        headRef = try container.decode(String.self, forKey: .headRef)
        baseRef = try container.decode(String.self, forKey: .baseRef)
        additions = try container.decode(Int.self, forKey: .additions)
        deletions = try container.decode(Int.self, forKey: .deletions)
        changedFiles = try container.decode(Int.self, forKey: .changedFiles)
        createdAt = try container.decode(String.self, forKey: .createdAt)
        updatedAt = try container.decode(String.self, forKey: .updatedAt)
        mergedAt = try container.decodeIfPresent(String.self, forKey: .mergedAt)
        closedAt = try container.decodeIfPresent(String.self, forKey: .closedAt)
        htmlUrl = try container.decode(String.self, forKey: .htmlUrl)
        checksStatus = try container.decodeIfPresent(String.self, forKey: .checksStatus)
        labels = try container.decodeIfPresent([GitHubLabel].self, forKey: .labels) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case number
        case title
        case body
        case state
        case draft
        case merged
        case user
        case headRef
        case baseRef
        case additions
        case deletions
        case changedFiles
        case createdAt
        case updatedAt
        case mergedAt
        case closedAt
        case htmlUrl
        case checksStatus
        case labels
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

    init(
        pull: GitHubPull,
        checks: [GitHubCheck],
        files: [GitHubPullFile],
        linkedIssue: GitHubIssue?,
        reviews: [GitHubPullReview],
        fromCache: Bool,
        cachedAt: String? = nil
    ) {
        self.pull = pull
        self.checks = checks
        self.files = files
        self.linkedIssue = linkedIssue
        self.reviews = reviews
        self.fromCache = fromCache
        self.cachedAt = cachedAt
    }

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
