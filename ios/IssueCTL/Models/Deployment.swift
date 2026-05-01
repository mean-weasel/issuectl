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
