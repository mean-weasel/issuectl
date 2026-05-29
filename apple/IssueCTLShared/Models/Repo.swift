import Foundation

enum WebhookPayloadMode: String, Codable, CaseIterable, Sendable {
    case metadata
    case raw
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
    let repos: [WorkbenchRepo]
    let deployments: [ActiveDeployment]
    let previews: [String: SessionPreview]
    let settings: [String: String]
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
