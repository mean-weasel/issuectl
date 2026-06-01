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
    let repoFullName: String?
    let owner: String?
    let repoName: String?
    let eventType: String
    let action: String?
    let senderLogin: String?
    let targetType: DeploymentTargetType?
    let targetNumber: Int?
    let targetLabel: String?
    let payloadJson: String?
    let receivedAt: Int
    let receivedAtIso: String?
    let intentId: Int?
    let result: String?
    let resultDetail: String?
    let actionId: String?
    let intent: WebhookIntentSummary?
}

struct WebhookEventsResponse: Codable, Sendable {
    let events: [WebhookEvent]
    let repos: [RepoContractSummary]
    let filters: WebhookEventFilters?
    let summary: WebhookEventSummary?
    let fromCache: Bool
    let cachedAt: String?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        events = try container.decode([WebhookEvent].self, forKey: .events)
        repos = try container.decodeIfPresent([RepoContractSummary].self, forKey: .repos) ?? []
        filters = try container.decodeIfPresent(WebhookEventFilters.self, forKey: .filters)
        summary = try container.decodeIfPresent(WebhookEventSummary.self, forKey: .summary)
        fromCache = try container.decodeIfPresent(Bool.self, forKey: .fromCache) ?? false
        cachedAt = try container.decodeIfPresent(String.self, forKey: .cachedAt)
    }

    private enum CodingKeys: String, CodingKey {
        case events, repos, filters, summary, fromCache, cachedAt
    }
}

struct RepoContractSummary: Codable, Identifiable, Sendable {
    let id: Int
    let fullName: String
}

struct WebhookIntentSummary: Codable, Identifiable, Sendable {
    let id: Int
    let status: String
    let targetType: DeploymentTargetType
    let targetNumber: Int
    let targetLabel: String
    let firstSignalAt: Int
    let firstSignalAtIso: String
    let lastSignalAt: Int
    let lastSignalAtIso: String
    let scheduledAt: Int
    let scheduledAtIso: String
    let processingStartedAt: Int?
    let processingStartedAtIso: String?
    let leaseExpiresAt: Int?
    let leaseExpiresAtIso: String?
    let resolvedAt: Int?
    let resolvedAtIso: String?
    let generation: Int
    let requestedAgent: String?
    let reviewMode: String?
    let signalCount: Int
    let deploymentId: Int?
    let failureReason: String?
}

struct WebhookEventFilters: Codable, Sendable {
    let repo: String?
    let targetType: DeploymentTargetType?
    let targetNumber: Int?
    let limit: Int
}

struct WebhookEventSummary: Codable, Sendable {
    let count: Int
    let latestReceivedAt: Int?
    let latestReceivedAtIso: String?
    let resultCounts: [String: Int]
}

enum ReviewRunStatus: String, Codable, CaseIterable, Sendable {
    case reserved
    case launching
    case inProgress = "in_progress"
    case completed
    case failed
    case superseded
}

enum ReviewRunStatusFilter: String, Codable, CaseIterable, Identifiable, Sendable {
    case all
    case reserved
    case launching
    case inProgress = "in_progress"
    case completed
    case failed
    case superseded

    var id: String { rawValue }
}

struct ReviewRun: Codable, Identifiable, Sendable {
    let id: Int
    let repoId: Int
    let repoFullName: String?
    let owner: String?
    let repoName: String?
    let prNumber: Int
    let deploymentId: Int?
    let startedHeadSha: String?
    let completedHeadSha: String?
    let reviewBaseSha: String?
    let reviewedFromSha: String?
    let reviewedToSha: String
    let headRepoFullName: String?
    let headRef: String?
    let status: ReviewRunStatus
    let triggeredBy: DeploymentTrigger
    let result: [String: JSONValue]?
    let resultJson: String?
    let summary: String?
    let findingCount: Int?
    let rangeLabel: String?
    let detailHref: String?
    let startedAt: Int
    let startedAtIso: String?
    let completedAt: Int?
    let completedAtIso: String?
    let deployment: ReviewRunDeployment?
}

struct ReviewRunsResponse: Codable, Sendable {
    let reviewRuns: [ReviewRun]
    let fromCache: Bool
    let cachedAt: String?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        reviewRuns = try container.decodeIfPresent([ReviewRun].self, forKey: .reviewRuns)
            ?? container.decodeIfPresent([ReviewRun].self, forKey: .reviews)
            ?? []
        fromCache = try container.decodeIfPresent(Bool.self, forKey: .fromCache) ?? false
        cachedAt = try container.decodeIfPresent(String.self, forKey: .cachedAt)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(reviewRuns, forKey: .reviewRuns)
        try container.encode(fromCache, forKey: .fromCache)
        try container.encodeIfPresent(cachedAt, forKey: .cachedAt)
    }

    private enum CodingKeys: String, CodingKey {
        case reviewRuns, reviews, fromCache, cachedAt
    }
}

struct ReviewRunDeployment: Codable, Identifiable, Sendable {
    let id: Int
    let repoId: Int
    let targetType: DeploymentTargetType
    let targetNumber: Int
    let targetLabel: String
    let issueNumber: Int?
    let branchName: String
    let agent: LaunchAgent?
    let workspaceMode: WorkspaceMode
    let workspacePath: String
    let linkedPrNumber: Int?
    let state: DeploymentState
    let terminalBackend: String?
    let triggeredBy: DeploymentTrigger?
    let parentDeploymentId: Int?
    let webhookDepth: Int?
    let launchedAt: String
    let endedAt: String?
    let terminalReason: String?
    let ttydPort: Int?
    let idleSince: String?
}

struct ReviewRunDetailResponse: Codable, Sendable {
    let review: ReviewRun
    let repo: ReviewRunDetailRepo
    let deployment: ReviewRunDeployment?
    let lineage: [ReviewRunLineageItem]
    let diagnostics: DeploymentDiagnosticsResponse
    let findings: [ReviewRunFinding]
    let banners: [ReviewRunBanner]
    let metadata: ReviewRunDetailMetadata
    let actions: ReviewRunDetailActions
    let links: ReviewRunDetailLinks
}

struct ReviewRunDetailRepo: Codable, Identifiable, Sendable {
    let id: Int
    let fullName: String
    let owner: String
    let name: String
}

struct ReviewRunLineageItem: Codable, Identifiable, Sendable {
    let id: Int
    let active: Bool
    let label: String
    let status: ReviewRunStatus
    let triggeredBy: DeploymentTrigger
    let deploymentId: Int?
    let reviewedFromSha: String?
    let reviewedToSha: String
    let result: [String: JSONValue]?
    let summary: String?
    let startedAt: Int
    let startedAtIso: String?
    let completedAt: Int?
    let completedAtIso: String?
}

struct ReviewRunBanner: Codable, Identifiable, Sendable {
    let tone: ReviewRunBannerTone
    let title: String
    let body: String

    var id: String { "\(tone.rawValue)-\(title)" }
}

struct ReviewRunFinding: Codable, Identifiable, Sendable {
    let id: String
    let title: String
    let body: String?
    let path: String?
    let line: Int?
    let severity: String?
    let htmlUrl: String?

    var locationLabel: String? {
        guard let path else { return nil }
        if let line { return "\(path):\(line)" }
        return path
    }
}

enum ReviewRunBannerTone: String, Codable, Sendable {
    case bad
    case warn
    case info
}

struct ReviewRunDetailMetadata: Codable, Sendable {
    let currentReviewPreamble: String?
    let triggerEvent: DiagnosticEvent?
}

struct ReviewRunDetailActions: Codable, Sendable {
    let canRetry: Bool
    let canFullRerun: Bool
    let disabledReason: String?
    let mobileWriteActionsEnabled: Bool
}

enum ReviewRunActionMode: String, Codable, Hashable, Sendable {
    case retry
    case full

    var requestedDisplayName: String {
        switch self {
        case .retry:
            return "Retry requested"
        case .full:
            return "Full rerun requested"
        }
    }
}

struct ReviewRunActionRequest: Codable, Sendable {
    let mode: ReviewRunActionMode
}

struct ReviewRunActionResponse: Codable, Sendable {
    let success: Bool
    let reviewId: Int
    let intentId: Int
    let mode: ReviewRunActionMode
    let message: String
}

struct ReviewRunDetailLinks: Codable, Sendable {
    let githubPr: String
    let githubReview: String?
    let githubReviewFiles: String
    let workbench: String
    let repoSettings: String
    let sessions: String
    let webhookLogs: String
    let diagnosticsCli: String
}

enum SessionsOverviewTab: String, Codable, CaseIterable, Sendable {
    case sessions
    case reviews
}

enum SessionsOverviewStateFilter: String, Codable, CaseIterable, Identifiable, Sendable {
    case active
    case ended
    case all

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .active: "Active"
        case .ended: "Ended"
        case .all: "All"
        }
    }
}

enum SessionsOverviewTriggerFilter: String, Codable, CaseIterable, Identifiable, Sendable {
    case manual
    case webhook
    case commentCommand = "comment_command"
    case all

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .manual: "Manual"
        case .webhook: "Webhook"
        case .commentCommand: "Comment command"
        case .all: "All"
        }
    }
}

struct SessionsOverviewFilters: Codable, Sendable {
    let tab: SessionsOverviewTab
    let q: String
    let repo: String
    let trigger: SessionsOverviewTriggerFilter
    let state: SessionsOverviewStateFilter
    let status: ReviewRunStatusFilter
}

struct SessionsOverviewRepoSummary: Codable, Identifiable, Sendable {
    let id: Int
    let fullName: String
}

struct SessionsOverviewSession: Codable, Identifiable, Sendable {
    let id: Int
    let repoId: Int
    let repoFullName: String
    let owner: String
    let repoName: String
    let targetType: DeploymentTargetType
    let targetNumber: Int
    let targetLabel: String
    let issueNumber: Int?
    let branchName: String
    let agent: LaunchAgent?
    let workspaceMode: WorkspaceMode
    let workspacePath: String
    let linkedPrNumber: Int?
    let triggeredBy: DeploymentTrigger?
    let parentDeploymentId: Int?
    let childDeploymentCount: Int
    let webhookDepth: Int
    let terminalReason: String?
    let terminalBackend: TerminalBackend?
    let launchedAt: String
    let endedAt: String?
    let ttydPort: Int?
    let idleSince: String?
    let preview: SessionPreview?
    let provenanceLabel: String?
    let elapsedLabel: String?

    var isActive: Bool { endedAt == nil }
    var isIssueTarget: Bool { targetType == .issue }
    var resolvedIssueNumber: Int { issueNumber ?? targetNumber }
    var repoTitle: String { "\(repoFullName) \(targetLabel)" }
    var usesPtyBridgeTerminal: Bool { terminalBackend == .ptyBridge }
    var canOpenTerminalInApp: Bool { isActive && ttydPort != nil }

    var terminalMetricValue: String {
        if let ttydPort {
            return "\(ttydPort)"
        }
        if usesPtyBridgeTerminal {
            return "PTY bridge"
        }
        return isActive ? "Starting" : "Ended"
    }

    var terminalActionSubtitle: String {
        if !isActive {
            return "Session has ended."
        }
        if let ttydPort {
            return "Port \(ttydPort)"
        }
        if usesPtyBridgeTerminal {
            return "PTY bridge terminals open from the web workbench."
        }
        return "Terminal is still preparing."
    }

    var sessionRoleTitle: String {
        if targetType == .pr && terminalReason == "review" {
            return "PR review session"
        }
        switch targetType {
        case .issue: return "Issue session"
        case .pr: return "PR session"
        }
    }

    var provenanceSummary: String {
        if let provenanceLabel, !provenanceLabel.isEmpty {
            return provenanceLabel
        }
        var parts: [String] = [triggeredBy?.displayName ?? "Unknown trigger"]
        if let agent {
            parts.append(agent.displayName)
        }
        if let parentDeploymentId {
            parts.append("follow-up #\(parentDeploymentId)")
        }
        if webhookDepth > 0 {
            parts.append("depth \(webhookDepth)")
        }
        return parts.joined(separator: " - ")
    }

    var durationLabel: String {
        elapsedLabel ?? runningDuration
    }

    var runningDuration: String {
        guard let date = parseIssueCTLDate(launchedAt) else { return "" }
        let endDate = endedAt.flatMap(parseIssueCTLDate) ?? Date()
        let interval = endDate.timeIntervalSince(date)
        let hours = Int(interval) / 3600
        let minutes = (Int(interval) % 3600) / 60
        if hours > 0 {
            return "\(hours)h \(minutes)m"
        }
        return "\(minutes)m"
    }

    var activeDeployment: ActiveDeployment {
        ActiveDeployment(
            id: id,
            repoId: repoId,
            issueNumber: resolvedIssueNumber,
            targetType: targetType,
            targetNumber: targetNumber,
            agent: agent,
            terminalBackend: terminalBackend,
            triggeredBy: triggeredBy,
            terminalReason: terminalReason,
            parentDeploymentId: parentDeploymentId,
            webhookDepth: webhookDepth,
            idleSince: idleSince,
            branchName: branchName,
            workspaceMode: workspaceMode,
            workspacePath: workspacePath,
            linkedPrNumber: linkedPrNumber,
            state: isActive ? .active : .ended,
            launchedAt: launchedAt,
            endedAt: endedAt,
            ttydPort: ttydPort,
            ttydPid: nil,
            owner: owner,
            repoName: repoName
        )
    }
}

struct SessionsOverviewSessionGroup: Codable, Identifiable, Sendable {
    let key: String
    let repoFullName: String
    let targetType: DeploymentTargetType
    let targetNumber: Int
    let targetLabel: String
    let sessions: [SessionsOverviewSession]
    let matchingSessionCount: Int?

    var id: String { key }
}

struct SessionsOverviewReviewRun: Codable, Identifiable, Sendable {
    let id: Int
    let repoId: Int
    let repoFullName: String
    let owner: String
    let repoName: String
    let prNumber: Int
    let deploymentId: Int?
    let startedHeadSha: String?
    let completedHeadSha: String?
    let reviewBaseSha: String?
    let reviewedFromSha: String?
    let reviewedToSha: String
    let headRepoFullName: String
    let headRef: String
    let status: ReviewRunStatus
    let triggeredBy: DeploymentTrigger
    let result: [String: JSONValue]
    let resultJson: String?
    let summary: String?
    let findingCount: Int?
    let rangeLabel: String
    let detailHref: String
    let provenanceLabel: String?
    let elapsedLabel: String?
    let startedAt: Int
    let completedAt: Int?
    let deployment: SessionsOverviewSession?

    var statusLabel: String {
        switch status {
        case .reserved: "Reserved"
        case .launching: "Launching"
        case .inProgress: "In progress"
        case .completed: "Completed"
        case .failed: "Failed"
        case .superseded: "Superseded"
        }
    }

    var isActive: Bool {
        status == .reserved || status == .launching || status == .inProgress
    }
}

struct SessionsOverviewReviewGroup: Codable, Identifiable, Sendable {
    let key: String
    let repoFullName: String
    let owner: String
    let repoName: String
    let prNumber: Int
    let runs: [SessionsOverviewReviewRun]
    let matchingRunCount: Int?

    var id: String { key }
}

struct SessionsOverviewSummary: Codable, Sendable {
    let activeSessions: Int
    let endedSessions: Int
    let reviewRuns: Int
    let activeReviewRuns: Int
}

struct SessionsOverviewData: Codable, Sendable {
    let initialized: Bool
    let filters: SessionsOverviewFilters
    let repos: [SessionsOverviewRepoSummary]
    let sessionGroups: [SessionsOverviewSessionGroup]
    let reviewGroups: [SessionsOverviewReviewGroup]
    let summary: SessionsOverviewSummary
}

struct SessionsOverviewResponse: Codable, Sendable {
    let overview: SessionsOverviewData
    let diagnostics: DeploymentDiagnosticsResponse?
    let generatedAt: String
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
    let timestampIso: String?
    let level: DiagnosticLevel
    let event: String
    let source: String?
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
    let serverTargetLabel: String?
    let metadata: [String: JSONValue]?
    let data: [String: JSONValue]?

    private enum CodingKeys: String, CodingKey {
        case id
        case timestamp
        case timestampIso
        case level
        case event
        case source
        case correlationId
        case owner
        case repo
        case issueNumber
        case targetType
        case targetNumber
        case deploymentId
        case sessionName
        case ttydPort
        case ttydPid
        case status
        case message
        case serverTargetLabel = "targetLabel"
        case metadata
        case data
    }
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
