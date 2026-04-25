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

    var id: Int { number }

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
    let fromCache: Bool
    let cachedAt: String?
}
