import Foundation

enum WebhookPayloadMode: String, Codable, CaseIterable, Sendable {
    case metadata
    case raw
}

enum JSONValue: Codable, Equatable, Sendable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Int.self) {
            self = .int(value)
        } else if let value = try? container.decode(Double.self) {
            self = .double(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unsupported JSON value"
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value):
            try container.encode(value)
        case .int(let value):
            try container.encode(value)
        case .double(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }
}

struct Repo: Codable, Identifiable, Sendable {
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
    let reviewPreamble: String?
    let createdAt: String

    var fullName: String { "\(owner)/\(name)" }

    init(
        id: Int,
        owner: String,
        name: String,
        localPath: String?,
        branchPattern: String?,
        autoLaunchIssues: Bool = false,
        autoReviewPrs: Bool = false,
        issueAgent: LaunchAgent = .claude,
        reviewAgent: LaunchAgent = .claude,
        webhookId: Int? = nil,
        webhookPayloadMode: WebhookPayloadMode = .metadata,
        reviewPreamble: String? = nil,
        createdAt: String
    ) {
        self.id = id
        self.owner = owner
        self.name = name
        self.localPath = localPath
        self.branchPattern = branchPattern
        self.autoLaunchIssues = autoLaunchIssues
        self.autoReviewPrs = autoReviewPrs
        self.issueAgent = issueAgent
        self.reviewAgent = reviewAgent
        self.webhookId = webhookId
        self.webhookPayloadMode = webhookPayloadMode
        self.reviewPreamble = reviewPreamble
        self.createdAt = createdAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        owner = try container.decode(String.self, forKey: .owner)
        name = try container.decode(String.self, forKey: .name)
        localPath = try container.decodeIfPresent(String.self, forKey: .localPath)
        branchPattern = try container.decodeIfPresent(String.self, forKey: .branchPattern)
        autoLaunchIssues = try container.decodeIfPresent(Bool.self, forKey: .autoLaunchIssues) ?? false
        autoReviewPrs = try container.decodeIfPresent(Bool.self, forKey: .autoReviewPrs) ?? false
        issueAgent = try container.decodeIfPresent(LaunchAgent.self, forKey: .issueAgent) ?? .claude
        reviewAgent = try container.decodeIfPresent(LaunchAgent.self, forKey: .reviewAgent) ?? .claude
        webhookId = try container.decodeIfPresent(Int.self, forKey: .webhookId)
        webhookPayloadMode = try container.decodeIfPresent(WebhookPayloadMode.self, forKey: .webhookPayloadMode) ?? .metadata
        reviewPreamble = try container.decodeIfPresent(String.self, forKey: .reviewPreamble)
        createdAt = try container.decode(String.self, forKey: .createdAt)
    }
}

struct ReposResponse: Codable, Sendable {
    let repos: [Repo]
}

struct WorkbenchPayload: Codable, Sendable {
    let drafts: [Draft]
    let repos: [WorkbenchRepo]
    let deployments: [ActiveDeployment]
    let previews: [String: SessionPreview]
    let settings: [String: String]
    let health: WorkbenchHealth
    let user: WorkbenchUser
    let generatedAt: String

    init(
        drafts: [Draft],
        repos: [WorkbenchRepo],
        deployments: [ActiveDeployment],
        previews: [String: SessionPreview],
        settings: [String: String],
        health: WorkbenchHealth,
        user: WorkbenchUser,
        generatedAt: String
    ) {
        self.drafts = drafts
        self.repos = repos
        self.deployments = deployments
        self.previews = previews
        self.settings = settings
        self.health = health
        self.user = user
        self.generatedAt = generatedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        drafts = try container.decodeIfPresent([Draft].self, forKey: .drafts) ?? []
        repos = try container.decode([WorkbenchRepo].self, forKey: .repos)
        deployments = try container.decode([ActiveDeployment].self, forKey: .deployments)
        previews = try container.decode([String: SessionPreview].self, forKey: .previews)
        settings = try container.decode([String: String].self, forKey: .settings)
        health = try container.decode(WorkbenchHealth.self, forKey: .health)
        user = try container.decode(WorkbenchUser.self, forKey: .user)
        generatedAt = try container.decode(String.self, forKey: .generatedAt)
    }
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
    let terminalBackendDefault: TerminalBackend?
    let issueError: String?
    let issuesFromCache: Bool
    let issuesCachedAt: String?
    let priorities: [IssuePriorityItem]
    let deployments: [ActiveDeployment]
    let recentCompletions: [Deployment]
    let webhookEvents: [WorkbenchWebhookEvent]
    let prReviews: [WorkbenchPrReview]
    let previews: [String: SessionPreview]
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

    var id: String { htmlUrl }
    var isOpen: Bool { state == "open" }
}

struct WorkbenchWebhookEvent: Codable, Identifiable, Sendable {
    let id: Int
    let deliveryId: String
    let repoId: Int?
    let eventType: String
    let action: String?
    let senderLogin: String?
    let targetType: DeploymentTargetType?
    let targetNumber: Int?
    let payloadJson: String?
    let receivedAt: Int
    let intentId: Int?
}

struct WorkbenchPrReview: Codable, Identifiable, Sendable {
    let id: Int
    let repoId: Int
    let prNumber: Int
    let deploymentId: Int?
    let startedHeadSha: String?
    let completedHeadSha: String?
    let reviewBaseSha: String?
    let reviewedFromSha: String?
    let reviewedToSha: String
    let headRepoFullName: String
    let headRef: String
    let status: String
    let triggeredBy: DeploymentTrigger
    let resultJson: String?
    let startedAt: Int
    let completedAt: Int?
}

struct WebhookAutomationHealth: Codable, Sendable {
    let state: String
    let summary: String
    let detail: String?
    let recovery: String?
    let expectedUrl: String?
    let hookId: Int?
    let githubUrl: String?
    let latestDelivery: WebhookLatestDelivery?

    var isOK: Bool { state == "ok" }
}

struct WebhookLatestDelivery: Codable, Sendable {
    let id: Int64?
    let guid: String?
    let event: String?
    let action: String?
    let status: String?
    let statusCode: Int?
    let deliveredAt: String?
}

struct WebhookHealthResponse: Codable, Sendable {
    let health: WebhookAutomationHealth
}

struct WebhookConfigurationResponse: Codable, Sendable {
    let success: Bool
    let repo: Repo?
    let webhook: WebhookConfiguration?
    let error: String?
}

struct WebhookConfiguration: Codable, Sendable {
    let id: Int
    let url: String
    let createdBy: String?
}

struct WebhookEvent: Codable, Identifiable, Sendable {
    let id: Int
    let deliveryId: String
    let repoId: Int
    let eventType: String
    let action: String?
    let senderLogin: String?
    let targetType: DeploymentTargetType?
    let targetNumber: Int?
    let payloadJson: String?
    let receivedAt: Int
    let intentId: Int?
}

struct WebhookEventsResponse: Codable, Sendable {
    let events: [WebhookEvent]
    let fromCache: Bool
    let cachedAt: String?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        events = try container.decode([WebhookEvent].self, forKey: .events)
        fromCache = try container.decodeIfPresent(Bool.self, forKey: .fromCache) ?? false
        cachedAt = try container.decodeIfPresent(String.self, forKey: .cachedAt)
    }

    private enum CodingKeys: String, CodingKey {
        case events, fromCache, cachedAt
    }
}

enum ReviewRunStatus: String, Codable, CaseIterable, Sendable {
    case reserved
    case launching
    case inProgress = "in_progress"
    case completed
    case failed
    case superseded
}

struct ReviewRun: Codable, Identifiable, Sendable {
    let id: Int
    let repoId: Int
    let prNumber: Int
    let deploymentId: Int?
    let startedHeadSha: String?
    let completedHeadSha: String?
    let reviewBaseSha: String
    let reviewedFromSha: String?
    let reviewedToSha: String
    let headRepoFullName: String
    let headRef: String
    let status: ReviewRunStatus
    let triggeredBy: DeploymentTrigger
    let resultJson: String?
    let startedAt: Int
    let completedAt: Int?
}

struct ReviewRunsResponse: Codable, Sendable {
    let reviewRuns: [ReviewRun]
    let fromCache: Bool
    let cachedAt: String?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        reviewRuns = try container.decode([ReviewRun].self, forKey: .reviewRuns)
        fromCache = try container.decodeIfPresent(Bool.self, forKey: .fromCache) ?? false
        cachedAt = try container.decodeIfPresent(String.self, forKey: .cachedAt)
    }

    private enum CodingKeys: String, CodingKey {
        case reviewRuns, fromCache, cachedAt
    }
}

enum DiagnosticLevel: String, Codable, CaseIterable, Sendable {
    case debug
    case info
    case warn
    case error
}

struct DiagnosticEvent: Codable, Identifiable, Sendable {
    let id: Int
    let timestamp: Int
    let level: DiagnosticLevel
    let event: String
    let source: String
    let correlationId: String?
    let owner: String?
    let repo: String?
    let issueNumber: Int?
    let targetType: DeploymentTargetType?
    let targetNumber: Int?
    let deploymentId: Int?
    let sessionName: String?
    let ttydPort: Int?
    let ttydPid: Int?
    let status: String?
    let message: String?
    let data: [String: JSONValue]?
}

struct DiagnosticsResponse: Codable, Sendable {
    let events: [DiagnosticEvent]
    let fromCache: Bool
    let cachedAt: String?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        events = try container.decode([DiagnosticEvent].self, forKey: .events)
        fromCache = try container.decodeIfPresent(Bool.self, forKey: .fromCache) ?? false
        cachedAt = try container.decodeIfPresent(String.self, forKey: .cachedAt)
    }

    private enum CodingKeys: String, CodingKey {
        case events, fromCache, cachedAt
    }
}

enum AgentMutationAction: String, Codable, CaseIterable, Sendable {
    case push
    case comment
    case label
    case createIssue = "create_issue"
    case createPr = "create_pr"
}

struct AgentMutationRequestBody: Codable, Sendable {
    let deploymentId: Int
    let completionToken: String
    let repoId: Int
    let targetType: DeploymentTargetType
    let targetNumber: Int
    let actionType: AgentMutationAction
    let payload: JSONValue?

    init(
        deploymentId: Int,
        completionToken: String,
        repoId: Int,
        targetType: DeploymentTargetType,
        targetNumber: Int,
        actionType: AgentMutationAction,
        payload: JSONValue? = nil
    ) {
        self.deploymentId = deploymentId
        self.completionToken = completionToken
        self.repoId = repoId
        self.targetType = targetType
        self.targetNumber = targetNumber
        self.actionType = actionType
        self.payload = payload
    }
}

struct AgentMutationDecision: Codable, Sendable {
    let allowed: Bool
    let reason: String?
}

enum AgentCompletionStatus: String, Codable, CaseIterable, Sendable {
    case completed
    case failed
    case noChanges = "no_changes"
    case pushedFixes = "pushed_fixes"
}

struct AgentCompletionRequestBody: Codable, Sendable {
    let deploymentId: Int
    let completionToken: String
    let status: AgentCompletionStatus
    let summary: String
    let finalHeadSha: String?
    let pushedCommitSha: String?
    let pushedCommits: [String]?
    let changedFileCount: Int?
    let fixedFindingCount: Int?
    let errorMessage: String?
}

struct AgentCompletionResponse: Codable, Sendable {
    let accepted: Bool
    let duplicate: Bool
    let reason: String?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        accepted = try container.decode(Bool.self, forKey: .accepted)
        duplicate = try container.decodeIfPresent(Bool.self, forKey: .duplicate) ?? false
        reason = try container.decodeIfPresent(String.self, forKey: .reason)
    }

    private enum CodingKeys: String, CodingKey {
        case accepted, duplicate, reason
    }
}
