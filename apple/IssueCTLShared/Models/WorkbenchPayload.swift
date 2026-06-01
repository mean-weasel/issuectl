import Foundation

typealias WorkbenchSettings = [String: String]
typealias WorkbenchPreview = SessionPreview

enum WorkbenchTerminalBackend: String, Codable, Sendable {
    case ttyd
    case ptyBridge = "pty_bridge"
}

enum WorkbenchDeploymentState: String, Codable, Sendable {
    case pending
    case active
    case ended
}

enum WebhookPayloadMode: String, Codable, Sendable {
    case metadata
    case raw
}

struct WorkbenchPayload: Codable, Sendable {
    let repos: [WorkbenchRepo]
    let deployments: [WorkbenchDeployment]
    let previews: [String: WorkbenchPreview]
    let settings: WorkbenchSettings
    let health: WorkbenchHealth
    let user: WorkbenchUser
    let generatedAt: String
}

struct WorkbenchHealth: Codable, Sendable {
    let ok: Bool
    let version: String?
    let timestamp: String?
    let error: String?
}

struct WorkbenchUser: Codable, Sendable {
    let login: String?
    let error: String?
}

struct WorkbenchRepo: Codable, Identifiable, Sendable {
    let id: Int
    let owner: String
    let name: String
    let localPath: String?
    let branchPattern: String?
    let autoLaunchIssues: Bool
    let autoReviewPrs: Bool
    let issueAgent: LaunchAgent
    let reviewAgent: LaunchAgent
    let webhookId: Int?
    let webhookPayloadMode: WebhookPayloadMode
    let badgeCount: Int
    let deployedCount: Int
    let launchAgent: LaunchAgent?
    let terminalBackendDefault: WorkbenchTerminalBackend?
    let issueError: String?
    let issuesFromCache: Bool
    let issuesCachedAt: String?
    let priorities: [WorkbenchIssuePriority]
    let deployments: [WorkbenchDeployment]
    let recentCompletions: [WorkbenchDeployment]
    let webhookEvents: [WorkbenchWebhookEvent]
    let prReviews: [WorkbenchPrReview]
    let previews: [String: WorkbenchPreview]
    let issues: [WorkbenchIssueSummary]

    var fullName: String { "\(owner)/\(name)" }
}

struct WorkbenchIssueSummary: Codable, Identifiable, Sendable {
    let number: Int
    let title: String
    let state: String
    let labels: [String]
    let updatedAt: String
    let priority: Priority
    let hasActiveDeployment: Bool
    let htmlUrl: String
    let authorLogin: String?

    var id: Int { number }
}

struct WorkbenchIssuePriority: Codable, Sendable {
    let repoId: Int
    let issueNumber: Int
    let priority: Priority
    let updatedAt: Int
}

struct WorkbenchDeployment: Codable, Identifiable, Sendable {
    let id: Int
    let repoId: Int
    let issueNumber: Int?
    let targetType: DeploymentTargetType
    let targetNumber: Int
    let agent: LaunchAgent?
    let branchName: String
    let workspaceMode: WorkspaceMode
    let workspacePath: String
    let linkedPrNumber: Int?
    let state: WorkbenchDeploymentState
    let terminalBackend: WorkbenchTerminalBackend?
    let triggeredBy: String?
    let parentDeploymentId: Int?
    let webhookDepth: Int?
    let launchedAt: String
    let endedAt: String?
    let terminalReason: String?
    let completionToken: String?
    let completionResultJson: String?
    let notificationSentAt: String?
    let ttydPort: Int?
    let ttydPid: Int?
    let idleSince: String?
    let owner: String
    let repoName: String

    var isActive: Bool { state == .active && endedAt == nil }
    var repoFullName: String { "\(owner)/\(repoName)" }
    var isIssueTarget: Bool { targetType == .issue }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let decodedTargetType = try container.decodeIfPresent(DeploymentTargetType.self, forKey: .targetType) ?? .issue
        let decodedTargetNumber = try container.decodeIfPresent(Int.self, forKey: .targetNumber)
        let decodedIssueNumber = try container.decodeIfPresent(Int.self, forKey: .issueNumber)

        guard let resolvedTargetNumber = decodedTargetNumber ?? decodedIssueNumber else {
            throw DecodingError.keyNotFound(
                CodingKeys.targetNumber,
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "WorkbenchDeployment requires targetNumber or issueNumber"
                )
            )
        }

        id = try container.decode(Int.self, forKey: .id)
        repoId = try container.decode(Int.self, forKey: .repoId)
        issueNumber = decodedIssueNumber
        targetType = decodedTargetType
        targetNumber = resolvedTargetNumber
        agent = try container.decodeIfPresent(LaunchAgent.self, forKey: .agent)
        branchName = try container.decode(String.self, forKey: .branchName)
        workspaceMode = try container.decode(WorkspaceMode.self, forKey: .workspaceMode)
        workspacePath = try container.decode(String.self, forKey: .workspacePath)
        linkedPrNumber = try container.decodeIfPresent(Int.self, forKey: .linkedPrNumber)
        state = try container.decode(WorkbenchDeploymentState.self, forKey: .state)
        terminalBackend = try container.decodeIfPresent(WorkbenchTerminalBackend.self, forKey: .terminalBackend)
        triggeredBy = try container.decodeIfPresent(String.self, forKey: .triggeredBy)
        parentDeploymentId = try container.decodeIfPresent(Int.self, forKey: .parentDeploymentId)
        webhookDepth = try container.decodeIfPresent(Int.self, forKey: .webhookDepth)
        launchedAt = try container.decode(String.self, forKey: .launchedAt)
        endedAt = try container.decodeIfPresent(String.self, forKey: .endedAt)
        terminalReason = try container.decodeIfPresent(String.self, forKey: .terminalReason)
        completionToken = try container.decodeIfPresent(String.self, forKey: .completionToken)
        completionResultJson = try container.decodeIfPresent(String.self, forKey: .completionResultJson)
        notificationSentAt = try container.decodeIfPresent(String.self, forKey: .notificationSentAt)
        ttydPort = try container.decodeIfPresent(Int.self, forKey: .ttydPort)
        ttydPid = try container.decodeIfPresent(Int.self, forKey: .ttydPid)
        idleSince = try container.decodeIfPresent(String.self, forKey: .idleSince)
        owner = try container.decode(String.self, forKey: .owner)
        repoName = try container.decode(String.self, forKey: .repoName)
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case repoId
        case issueNumber
        case targetType
        case targetNumber
        case agent
        case branchName
        case workspaceMode
        case workspacePath
        case linkedPrNumber
        case state
        case terminalBackend
        case triggeredBy
        case parentDeploymentId
        case webhookDepth
        case launchedAt
        case endedAt
        case terminalReason
        case completionToken
        case completionResultJson
        case notificationSentAt
        case ttydPort
        case ttydPid
        case idleSince
        case owner
        case repoName
    }
}

struct WorkbenchWebhookEvent: Codable, Identifiable, Sendable {
    let id: Int
    let deliveryId: String
    let eventType: String
    let action: String?
    let senderLogin: String?
    let targetType: DeploymentTargetType?
    let targetNumber: Int?
    let receivedAt: Int
    let intentId: Int?
}

struct WorkbenchPrReview: Codable, Identifiable, Sendable {
    let id: Int
    let repoId: Int
    let prNumber: Int
    let deploymentId: Int?
    let startedHeadSha: String
    let completedHeadSha: String?
    let reviewBaseSha: String
    let reviewedFromSha: String?
    let reviewedToSha: String
    let headRepoFullName: String
    let headRef: String
    let status: String
    let triggeredBy: String
    let resultJson: String?
    let startedAt: Int
    let completedAt: Int?
}
