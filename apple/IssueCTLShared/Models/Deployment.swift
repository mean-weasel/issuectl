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
    case pending
    case active
    case ended
}

enum DeploymentTargetType: String, Codable, Sendable {
    case issue
    case pr
}

enum DeploymentTrigger: String, Codable, Sendable {
    case manual
    case webhook
    case commentCommand = "comment_command"

    var displayName: String {
        switch self {
        case .manual:
            return "Manual"
        case .webhook:
            return "Webhook"
        case .commentCommand:
            return "Comment command"
        }
    }
}

enum TerminalBackend: String, Codable, Sendable {
    case ttyd
    case ptyBridge = "pty_bridge"
}

// MARK: - Models

struct Deployment: Codable, Identifiable, Sendable {
    let id: Int
    let repoId: Int
    let issueNumber: Int
    let targetType: DeploymentTargetType
    let targetNumber: Int
    let agent: LaunchAgent?
    let terminalBackend: TerminalBackend?
    let triggeredBy: DeploymentTrigger?
    let terminalReason: String?
    let parentDeploymentId: Int?
    let webhookDepth: Int?
    let idleSince: String?
    let branchName: String
    let workspaceMode: WorkspaceMode
    let workspacePath: String
    let linkedPrNumber: Int?
    let state: DeploymentState
    let launchedAt: String
    let endedAt: String?
    let completionToken: String?
    let completionResultJson: String?
    let notificationSentAt: String?
    let ttydPort: Int?
    let ttydPid: Int?

    var isActive: Bool { state == .active && endedAt == nil }

    var targetLabel: String {
        switch targetType {
        case .issue:
            return "#\(targetNumber)"
        case .pr:
            return "PR #\(targetNumber)"
        }
    }

    var isIssueTarget: Bool {
        targetType == .issue
    }

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

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let decodedTargetType = try container.decodeIfPresent(DeploymentTargetType.self, forKey: .targetType) ?? .issue
        let decodedIssueNumber = try container.decodeIfPresent(Int.self, forKey: .issueNumber)
        let decodedTargetNumber = try container.decodeIfPresent(Int.self, forKey: .targetNumber)
        guard let resolvedTargetNumber = decodedTargetNumber ?? decodedIssueNumber else {
            throw DecodingError.keyNotFound(
                CodingKeys.targetNumber,
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "Deployment requires targetNumber or issueNumber"
                )
            )
        }

        id = try container.decode(Int.self, forKey: .id)
        repoId = try container.decode(Int.self, forKey: .repoId)
        issueNumber = decodedIssueNumber ?? resolvedTargetNumber
        targetType = decodedTargetType
        targetNumber = resolvedTargetNumber
        agent = try container.decodeIfPresent(LaunchAgent.self, forKey: .agent)
        terminalBackend = try container.decodeIfPresent(TerminalBackend.self, forKey: .terminalBackend)
        triggeredBy = try container.decodeIfPresent(DeploymentTrigger.self, forKey: .triggeredBy)
        terminalReason = try container.decodeIfPresent(String.self, forKey: .terminalReason)
        parentDeploymentId = try container.decodeIfPresent(Int.self, forKey: .parentDeploymentId)
        webhookDepth = try container.decodeIfPresent(Int.self, forKey: .webhookDepth)
        idleSince = try container.decodeIfPresent(String.self, forKey: .idleSince)
        branchName = try container.decode(String.self, forKey: .branchName)
        workspaceMode = try container.decode(WorkspaceMode.self, forKey: .workspaceMode)
        workspacePath = try container.decode(String.self, forKey: .workspacePath)
        linkedPrNumber = try container.decodeIfPresent(Int.self, forKey: .linkedPrNumber)
        state = try container.decode(DeploymentState.self, forKey: .state)
        launchedAt = try container.decode(String.self, forKey: .launchedAt)
        endedAt = try container.decodeIfPresent(String.self, forKey: .endedAt)
        completionToken = try container.decodeIfPresent(String.self, forKey: .completionToken)
        completionResultJson = try container.decodeIfPresent(String.self, forKey: .completionResultJson)
        notificationSentAt = try container.decodeIfPresent(String.self, forKey: .notificationSentAt)
        ttydPort = try container.decodeIfPresent(Int.self, forKey: .ttydPort)
        ttydPid = try container.decodeIfPresent(Int.self, forKey: .ttydPid)
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case repoId
        case issueNumber
        case targetType
        case targetNumber
        case agent
        case terminalBackend
        case triggeredBy
        case terminalReason
        case parentDeploymentId
        case webhookDepth
        case idleSince
        case branchName
        case workspaceMode
        case workspacePath
        case linkedPrNumber
        case state
        case launchedAt
        case endedAt
        case completionToken
        case completionResultJson
        case notificationSentAt
        case ttydPort
        case ttydPid
    }
}

struct ActiveDeployment: Codable, Identifiable, Sendable {
    let id: Int
    let repoId: Int
    let issueNumber: Int
    let targetType: DeploymentTargetType
    let targetNumber: Int
    let agent: LaunchAgent?
    let terminalBackend: TerminalBackend?
    let triggeredBy: DeploymentTrigger?
    let terminalReason: String?
    let parentDeploymentId: Int?
    let webhookDepth: Int?
    let idleSince: String?
    let completionToken: String?
    let completionResultJson: String?
    let notificationSentAt: String?
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

    var targetLabel: String {
        switch targetType {
        case .issue:
            return "#\(targetNumber)"
        case .pr:
            return "PR #\(targetNumber)"
        }
    }

    var targetTitle: String {
        "\(repoFullName) \(targetLabel)"
    }

    var isIssueTarget: Bool {
        targetType == .issue
    }

    var sessionRoleTitle: String {
        if targetType == .pr && terminalReason == "review" {
            return "PR review session"
        }
        switch targetType {
        case .issue:
            return "Issue session"
        case .pr:
            return "PR session"
        }
    }

    var provenanceSummary: String {
        var parts: [String] = []
        if let triggeredBy {
            parts.append(triggeredBy.displayName)
        } else {
            parts.append("Unknown trigger")
        }
        if let agent {
            parts.append(agent.displayName)
        }
        if let parentDeploymentId {
            parts.append("follow-up #\(parentDeploymentId)")
        }
        if let webhookDepth, webhookDepth > 0 {
            parts.append("depth \(webhookDepth)")
        }
        return parts.joined(separator: " - ")
    }

    var workspaceSummary: String {
        switch terminalBackend {
        case .ptyBridge:
            return "\(branchName) - PTY bridge"
        case .ttyd:
            return "\(branchName) - ttyd"
        case nil:
            return branchName
        }
    }

    func matchesPullRequest(owner: String, repo: String, number: Int) -> Bool {
        targetType == .pr
            && targetNumber == number
            && self.owner == owner
            && repoName == repo
    }

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

    init(
        id: Int,
        repoId: Int,
        issueNumber: Int,
        targetType: DeploymentTargetType = .issue,
        targetNumber: Int? = nil,
        agent: LaunchAgent? = nil,
        terminalBackend: TerminalBackend? = nil,
        triggeredBy: DeploymentTrigger? = nil,
        terminalReason: String? = nil,
        parentDeploymentId: Int? = nil,
        webhookDepth: Int? = nil,
        idleSince: String? = nil,
        completionToken: String? = nil,
        completionResultJson: String? = nil,
        notificationSentAt: String? = nil,
        branchName: String,
        workspaceMode: WorkspaceMode,
        workspacePath: String,
        linkedPrNumber: Int?,
        state: DeploymentState,
        launchedAt: String,
        endedAt: String?,
        ttydPort: Int?,
        ttydPid: Int?,
        owner: String,
        repoName: String
    ) {
        self.id = id
        self.repoId = repoId
        self.issueNumber = issueNumber
        self.targetType = targetType
        self.targetNumber = targetNumber ?? issueNumber
        self.agent = agent
        self.terminalBackend = terminalBackend
        self.triggeredBy = triggeredBy
        self.terminalReason = terminalReason
        self.parentDeploymentId = parentDeploymentId
        self.webhookDepth = webhookDepth
        self.idleSince = idleSince
        self.completionToken = completionToken
        self.completionResultJson = completionResultJson
        self.notificationSentAt = notificationSentAt
        self.branchName = branchName
        self.workspaceMode = workspaceMode
        self.workspacePath = workspacePath
        self.linkedPrNumber = linkedPrNumber
        self.state = state
        self.launchedAt = launchedAt
        self.endedAt = endedAt
        self.ttydPort = ttydPort
        self.ttydPid = ttydPid
        self.owner = owner
        self.repoName = repoName
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let decodedTargetType = try container.decodeIfPresent(DeploymentTargetType.self, forKey: .targetType) ?? .issue
        let decodedIssueNumber = try container.decodeIfPresent(Int.self, forKey: .issueNumber)
        let decodedTargetNumber = try container.decodeIfPresent(Int.self, forKey: .targetNumber)
        guard let resolvedTargetNumber = decodedTargetNumber ?? decodedIssueNumber else {
            throw DecodingError.keyNotFound(
                CodingKeys.targetNumber,
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "ActiveDeployment requires targetNumber or issueNumber"
                )
            )
        }

        id = try container.decode(Int.self, forKey: .id)
        repoId = try container.decode(Int.self, forKey: .repoId)
        issueNumber = decodedIssueNumber ?? resolvedTargetNumber
        targetType = decodedTargetType
        targetNumber = resolvedTargetNumber
        agent = try container.decodeIfPresent(LaunchAgent.self, forKey: .agent)
        terminalBackend = try container.decodeIfPresent(TerminalBackend.self, forKey: .terminalBackend)
        triggeredBy = try container.decodeIfPresent(DeploymentTrigger.self, forKey: .triggeredBy)
        terminalReason = try container.decodeIfPresent(String.self, forKey: .terminalReason)
        parentDeploymentId = try container.decodeIfPresent(Int.self, forKey: .parentDeploymentId)
        webhookDepth = try container.decodeIfPresent(Int.self, forKey: .webhookDepth)
        idleSince = try container.decodeIfPresent(String.self, forKey: .idleSince)
        completionToken = try container.decodeIfPresent(String.self, forKey: .completionToken)
        completionResultJson = try container.decodeIfPresent(String.self, forKey: .completionResultJson)
        notificationSentAt = try container.decodeIfPresent(String.self, forKey: .notificationSentAt)
        branchName = try container.decode(String.self, forKey: .branchName)
        workspaceMode = try container.decode(WorkspaceMode.self, forKey: .workspaceMode)
        workspacePath = try container.decode(String.self, forKey: .workspacePath)
        linkedPrNumber = try container.decodeIfPresent(Int.self, forKey: .linkedPrNumber)
        state = try container.decode(DeploymentState.self, forKey: .state)
        launchedAt = try container.decode(String.self, forKey: .launchedAt)
        endedAt = try container.decodeIfPresent(String.self, forKey: .endedAt)
        ttydPort = try container.decodeIfPresent(Int.self, forKey: .ttydPort)
        ttydPid = try container.decodeIfPresent(Int.self, forKey: .ttydPid)
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
        case terminalBackend
        case triggeredBy
        case terminalReason
        case parentDeploymentId
        case webhookDepth
        case idleSince
        case completionToken
        case completionResultJson
        case notificationSentAt
        case branchName
        case workspaceMode
        case workspacePath
        case linkedPrNumber
        case state
        case launchedAt
        case endedAt
        case ttydPort
        case ttydPid
        case owner
        case repoName
    }
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

// MARK: - Diagnostics

extension DiagnosticLevel {
    var displayName: String {
        switch self {
        case .debug: "Debug"
        case .info: "Info"
        case .warn: "Warning"
        case .error: "Error"
        }
    }

    var systemImage: String {
        switch self {
        case .debug: "ladybug"
        case .info: "info.circle"
        case .warn: "exclamationmark.triangle"
        case .error: "xmark.octagon"
        }
    }
}

extension JSONValue {
    var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    var integerValue: Int? {
        switch self {
        case .int(let value):
            value
        case .double(let value):
            Int(value)
        default:
            nil
        }
    }

    var doubleValue: Double? {
        switch self {
        case .int(let value):
            Double(value)
        case .double(let value):
            value
        default:
            nil
        }
    }

    var boolValue: Bool? {
        if case .bool(let value) = self { return value }
        return nil
    }

    var displayValue: String {
        switch self {
        case .string(let value):
            value
        case .int(let value):
            String(value)
        case .double(let value):
            value.rounded() == value ? String(Int(value)) : String(value)
        case .bool(let value):
            value ? "true" : "false"
        case .object(let value):
            "\(value.count) fields"
        case .array(let value):
            "\(value.count) items"
        case .null:
            "null"
        }
    }
}

extension DiagnosticEvent {
    var occurredAt: Date {
        let rawTimestamp = Double(timestamp)
        let seconds = rawTimestamp > 10_000_000_000 ? rawTimestamp / 1000 : rawTimestamp
        return Date(timeIntervalSince1970: seconds)
    }

    var timeText: String {
        DateFormatter.localizedString(from: occurredAt, dateStyle: .none, timeStyle: .medium)
    }

    var targetLabel: String? {
        guard let targetType, let targetNumber else { return nil }
        switch targetType {
        case .issue: return "#\(targetNumber)"
        case .pr: return "PR #\(targetNumber)"
        }
    }

    var isFailure: Bool {
        level == .error
            || event.contains("failed")
            || event.contains("missing")
            || status?.lowercased() == "failed"
    }

    var metadataRows: [(String, String)] {
        var rows: [(String, String)] = []
        if let status { rows.append(("Status", status)) }
        if let correlationId { rows.append(("Correlation", correlationId)) }
        if let sessionName { rows.append(("Session", sessionName)) }
        if let ttydPort { rows.append(("ttyd port", "\(ttydPort)")) }
        if let ttydPid { rows.append(("ttyd pid", "\(ttydPid)")) }
        if let data {
            for key in data.keys.sorted() {
                if let value = data[key] {
                    rows.append((key, value.displayValue))
                }
            }
        }
        return rows
    }
}

struct DeploymentDiagnosticsResponse: Codable, Sendable {
    let events: [DiagnosticEvent]
    let fromCache: Bool
    let cachedAt: String?

    init(events: [DiagnosticEvent], fromCache: Bool = false, cachedAt: String? = nil) {
        self.events = events
        self.fromCache = fromCache
        self.cachedAt = cachedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        events = try container.decode([DiagnosticEvent].self, forKey: .events)
        fromCache = try container.decodeIfPresent(Bool.self, forKey: .fromCache) ?? false
        cachedAt = try container.decodeIfPresent(String.self, forKey: .cachedAt)
    }

    private enum CodingKeys: String, CodingKey {
        case events, fromCache, cachedAt
    }

    var firstFailure: DiagnosticEvent? {
        events.first(where: \.isFailure)
    }

    var summaryText: String {
        guard !events.isEmpty else { return "No diagnostic events recorded yet" }
        let countLabel = events.count == 1 ? "1 diagnostic event" : "\(events.count) diagnostic events"
        if let firstFailure {
            return "\(countLabel), first failure: \(firstFailure.event)"
        }
        return "\(countLabel), no failure recorded"
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
    let targetType: DeploymentTargetType
    let targetNumber: Int

    init(
        owner: String,
        repo: String,
        issueNumber: Int,
        targetType: DeploymentTargetType = .issue,
        targetNumber: Int? = nil
    ) {
        self.owner = owner
        self.repo = repo
        self.issueNumber = issueNumber
        self.targetType = targetType
        self.targetNumber = targetNumber ?? issueNumber
    }
}

struct EndSessionResponse: Codable, Sendable {
    let success: Bool
    let error: String?
}
