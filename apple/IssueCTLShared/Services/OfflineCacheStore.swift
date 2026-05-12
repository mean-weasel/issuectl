import Foundation

struct OfflineCacheEntry<Value: Codable>: Codable {
    let value: Value
    let cachedAt: String
}

struct OfflineCacheStore {
    private let defaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func save<Value: Codable>(_ value: Value, for key: String, serverURL: String, cachedAt: String? = nil) {
        let entry = OfflineCacheEntry(value: value, cachedAt: cachedAt ?? currentTimestamp())
        guard let data = try? encoder.encode(entry) else { return }
        defaults.set(data, forKey: storageKey(key, serverURL: serverURL))
    }

    func load<Value: Codable>(_ type: Value.Type, for key: String, serverURL: String) -> OfflineCacheEntry<Value>? {
        guard let data = defaults.data(forKey: storageKey(key, serverURL: serverURL)) else { return nil }
        return try? decoder.decode(OfflineCacheEntry<Value>.self, from: data)
    }

    func remove(for key: String, serverURL: String) {
        defaults.removeObject(forKey: storageKey(key, serverURL: serverURL))
    }

    private func storageKey(_ key: String, serverURL: String) -> String {
        "issuectl.offline.\(sanitize(serverURL)).\(sanitize(key))"
    }

    private func sanitize(_ value: String) -> String {
        value
            .lowercased()
            .map { character in
                character.isLetter || character.isNumber ? character : "_"
            }
            .reduce(into: "") { $0.append($1) }
    }

    private func currentTimestamp() -> String {
        sharedISO8601Formatter.string(from: Date())
    }
}

enum OfflineActionStatus: String, Codable, Equatable, Sendable {
    case pending
    case inFlight
    case failed
}

struct IssueCommentOfflineAction: Codable, Equatable, Sendable {
    let owner: String
    let repo: String
    let issueNumber: Int
    let body: String
}

struct IssueStateOfflineAction: Codable, Equatable, Sendable {
    let owner: String
    let repo: String
    let issueNumber: Int
    let state: String
    let comment: String?
}

enum OfflineActionKind: Codable, Equatable, Sendable {
    case issueComment(IssueCommentOfflineAction)
    case issueState(IssueStateOfflineAction)
}

struct QueuedOfflineAction: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let kind: OfflineActionKind
    var status: OfflineActionStatus
    var retryCount: Int
    var lastError: String?
    let createdAt: String
    var updatedAt: String
}

protocol OfflineActionQueueStoring {
    func allActions() -> [QueuedOfflineAction]
    func pendingActions() -> [QueuedOfflineAction]
    func failedActions() -> [QueuedOfflineAction]

    @discardableResult
    func enqueueIssueComment(
        owner: String,
        repo: String,
        issueNumber: Int,
        body: String,
        id: String?,
        now: Date
    ) -> QueuedOfflineAction

    @discardableResult
    func enqueueIssueState(
        owner: String,
        repo: String,
        issueNumber: Int,
        state: String,
        comment: String?,
        id: String?,
        now: Date
    ) -> QueuedOfflineAction

    func remove(id: String)

    @discardableResult
    func markInFlight(id: String, now: Date) -> QueuedOfflineAction?

    func markCompleted(id: String)

    @discardableResult
    func markFailed(id: String, error: String, now: Date) -> QueuedOfflineAction?

    @discardableResult
    func markPending(id: String, now: Date) -> QueuedOfflineAction?

    func removeFailedActions()
}

struct OfflineActionQueueStore: OfflineActionQueueStoring {
    private let defaults: UserDefaults
    private let storageKey: String
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(defaults: UserDefaults = .standard, storageKey: String = "issuectl.offlineActionQueue") {
        self.defaults = defaults
        self.storageKey = storageKey
    }

    func allActions() -> [QueuedOfflineAction] {
        loadActions()
    }

    func pendingActions() -> [QueuedOfflineAction] {
        loadActions().filter { $0.status == .pending }
    }

    func failedActions() -> [QueuedOfflineAction] {
        loadActions().filter { $0.status == .failed }
    }

    @discardableResult
    func enqueueIssueComment(
        owner: String,
        repo: String,
        issueNumber: Int,
        body: String,
        id: String? = nil,
        now: Date = Date()
    ) -> QueuedOfflineAction {
        let timestamp = timestamp(for: now)
        let action = QueuedOfflineAction(
            id: id ?? UUID().uuidString,
            kind: .issueComment(
                IssueCommentOfflineAction(
                    owner: owner,
                    repo: repo,
                    issueNumber: issueNumber,
                    body: body
                )
            ),
            status: .pending,
            retryCount: 0,
            lastError: nil,
            createdAt: timestamp,
            updatedAt: timestamp
        )

        var actions = loadActions()
        actions.append(action)
        saveActions(actions)
        return action
    }

    @discardableResult
    func enqueueIssueState(
        owner: String,
        repo: String,
        issueNumber: Int,
        state: String,
        comment: String? = nil,
        id: String? = nil,
        now: Date = Date()
    ) -> QueuedOfflineAction {
        let timestamp = timestamp(for: now)
        let action = QueuedOfflineAction(
            id: id ?? UUID().uuidString,
            kind: .issueState(
                IssueStateOfflineAction(
                    owner: owner,
                    repo: repo,
                    issueNumber: issueNumber,
                    state: state,
                    comment: comment
                )
            ),
            status: .pending,
            retryCount: 0,
            lastError: nil,
            createdAt: timestamp,
            updatedAt: timestamp
        )

        var actions = loadActions()
        actions.append(action)
        saveActions(actions)
        return action
    }

    func remove(id: String) {
        saveActions(loadActions().filter { $0.id != id })
    }

    func markCompleted(id: String) {
        remove(id: id)
    }

    @discardableResult
    func markInFlight(id: String, now: Date = Date()) -> QueuedOfflineAction? {
        updateAction(id: id) { action in
            action.status = .inFlight
            action.updatedAt = timestamp(for: now)
        }
    }

    @discardableResult
    func markFailed(id: String, error: String, now: Date = Date()) -> QueuedOfflineAction? {
        updateAction(id: id) { action in
            action.status = .failed
            action.retryCount += 1
            action.lastError = error
            action.updatedAt = timestamp(for: now)
        }
    }

    @discardableResult
    func markPending(id: String, now: Date = Date()) -> QueuedOfflineAction? {
        updateAction(id: id) { action in
            action.status = .pending
            action.updatedAt = timestamp(for: now)
        }
    }

    func removeFailedActions() {
        saveActions(loadActions().filter { $0.status != .failed })
    }

    private func updateAction(
        id: String,
        update: (inout QueuedOfflineAction) -> Void
    ) -> QueuedOfflineAction? {
        var actions = loadActions()
        guard let index = actions.firstIndex(where: { $0.id == id }) else { return nil }
        update(&actions[index])
        saveActions(actions)
        return actions[index]
    }

    private func loadActions() -> [QueuedOfflineAction] {
        guard let data = defaults.data(forKey: storageKey) else { return [] }
        return (try? decoder.decode([QueuedOfflineAction].self, from: data)) ?? []
    }

    private func saveActions(_ actions: [QueuedOfflineAction]) {
        guard let data = try? encoder.encode(actions) else { return }
        defaults.set(data, forKey: storageKey)
    }

    private func timestamp(for date: Date) -> String {
        sharedISO8601Formatter.string(from: date)
    }
}
