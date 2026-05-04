import Foundation

// MARK: - Enums

enum WorkspaceMode: String, Codable, CaseIterable, Sendable {
    case clone
    case worktree
    case existing
}

enum LaunchAgent: String, Codable, CaseIterable, Hashable, Identifiable, Sendable {
    case claude
    case codex

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .claude:
            return "Claude Code"
        case .codex:
            return "Codex"
        }
    }

    static func settingValue(_ value: String?) -> LaunchAgent {
        guard let value, let agent = LaunchAgent(rawValue: value) else {
            return .claude
        }
        return agent
    }
}

enum DeploymentState: String, Codable, Sendable {
    case active
    case ended
}

// MARK: - Models

struct Deployment: Codable, Identifiable, Sendable {
    let id: Int
    let repoId: Int
    let issueNumber: Int
    let branchName: String
    let workspaceMode: WorkspaceMode
    let workspacePath: String
    let linkedPrNumber: Int?
    let state: DeploymentState
    let launchedAt: String
    let endedAt: String?
    let ttydPort: Int?
    let ttydPid: Int?

    var isActive: Bool { state == .active && endedAt == nil }

    var launchedDate: Date? {
        parseIssueCTLDate(launchedAt)
    }

    var runningDuration: String {
        guard let date = launchedDate else { return "" }
        let interval = Date().timeIntervalSince(date)
        let hours = Int(interval) / 3600
        let minutes = (Int(interval) % 3600) / 60
        if hours > 0 {
            return "\(hours)h \(minutes)m"
        }
        return "\(minutes)m"
    }
}

struct ActiveDeployment: Codable, Identifiable, Sendable {
    let id: Int
    let repoId: Int
    let issueNumber: Int
    let branchName: String
    let workspaceMode: WorkspaceMode
    let workspacePath: String
    let linkedPrNumber: Int?
    let state: DeploymentState
    let launchedAt: String
    let endedAt: String?
    let ttydPort: Int?
    let ttydPid: Int?
    let owner: String
    let repoName: String

    var isActive: Bool { state == .active && endedAt == nil }

    var launchedDate: Date? {
        parseIssueCTLDate(launchedAt)
    }

    var runningDuration: String {
        guard let date = launchedDate else { return "" }
        let interval = Date().timeIntervalSince(date)
        let hours = Int(interval) / 3600
        let minutes = (Int(interval) % 3600) / 60
        if hours > 0 {
            return "\(hours)h \(minutes)m"
        }
        return "\(minutes)m"
    }

    var repoFullName: String { "\(owner)/\(repoName)" }
}

struct ActiveDeploymentsResponse: Codable, Sendable {
    let deployments: [ActiveDeployment]
    let fromCache: Bool
    let cachedAt: String?

    init(deployments: [ActiveDeployment], fromCache: Bool = false, cachedAt: String? = nil) {
        self.deployments = deployments
        self.fromCache = fromCache
        self.cachedAt = cachedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        deployments = try container.decode([ActiveDeployment].self, forKey: .deployments)
        fromCache = try container.decodeIfPresent(Bool.self, forKey: .fromCache) ?? false
        cachedAt = try container.decodeIfPresent(String.self, forKey: .cachedAt)
    }

    private enum CodingKeys: String, CodingKey {
        case deployments, fromCache, cachedAt
    }
}

enum SessionPreviewStatus: String, Codable, Sendable {
    case active
    case idle
    case error
    case unavailable

    var displayName: String {
        switch self {
        case .active:
            return "Active"
        case .idle:
            return "Idle"
        case .error:
            return "Error"
        case .unavailable:
            return "Unavailable"
        }
    }

    var accessibilityName: String {
        switch self {
        case .active:
            return "active"
        case .idle:
            return "idle"
        case .error:
            return "error"
        case .unavailable:
            return "preview unavailable"
        }
    }
}

struct SessionPreview: Codable, Sendable {
    let lines: [String]
    let lastUpdatedMs: Int
    let lastChangedMs: Int?
    let status: SessionPreviewStatus

    var latestLine: String? {
        lines.last
    }

    var lastUpdatedDate: Date {
        Date(timeIntervalSince1970: TimeInterval(lastUpdatedMs) / 1000)
    }
}

struct SessionPreviewsResponse: Codable, Sendable {
    let previews: [String: SessionPreview]

    var previewsByPort: [Int: SessionPreview] {
        Dictionary(uniqueKeysWithValues: previews.compactMap { key, value in
            guard let port = Int(key) else { return nil }
            return (port, value)
        })
    }
}

struct LaunchRequestBody: Encodable, Sendable {
    let agent: LaunchAgent
    let branchName: String
    let workspaceMode: WorkspaceMode
    let selectedCommentIndices: [Int]
    let selectedFilePaths: [String]
    let preamble: String?
    let forceResume: Bool?
    let idempotencyKey: String?
}

struct LaunchResponse: Codable, Sendable {
    let success: Bool
    let deploymentId: Int?
    let ttydPort: Int?
    let error: String?
    let labelWarning: String?
}

struct EndSessionRequestBody: Encodable, Sendable {
    let owner: String
    let repo: String
    let issueNumber: Int
}

struct EndSessionResponse: Codable, Sendable {
    let success: Bool
    let error: String?
}
