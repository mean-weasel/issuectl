import Foundation

@MainActor
protocol OfflineIssueCommentPosting: AnyObject {
    func commentOnIssue(
        owner: String,
        repo: String,
        number: Int,
        body: IssueCommentRequestBody
    ) async throws -> IssueCommentResponse
}

@MainActor
protocol OfflineIssueStateUpdating: AnyObject {
    func updateIssueState(
        owner: String,
        repo: String,
        number: Int,
        body: IssueStateRequestBody
    ) async throws -> IssueStateResponse
}

extension APIClient: OfflineIssueCommentPosting {}
extension APIClient: OfflineIssueStateUpdating {}

func isQueueableNetworkFailure(_ error: Error, isConnected: Bool) -> Bool {
    if !isConnected {
        return true
    }

    let nsError = error as NSError
    guard nsError.domain == NSURLErrorDomain else {
        return false
    }

    switch nsError.code {
    case NSURLErrorNotConnectedToInternet,
        NSURLErrorNetworkConnectionLost,
        NSURLErrorCannotConnectToHost,
        NSURLErrorCannotFindHost,
        NSURLErrorTimedOut,
        NSURLErrorInternationalRoamingOff,
        NSURLErrorDataNotAllowed:
        return true
    default:
        return false
    }
}

struct OfflineSyncResult: Equatable, Sendable {
    let attempted: Int
    let completed: Int
    let failed: Int
    let alreadyRunning: Bool

    static var alreadyRunning: OfflineSyncResult {
        OfflineSyncResult(
            attempted: 0,
            completed: 0,
            failed: 0,
            alreadyRunning: true
        )
    }
}

@MainActor
@Observable
final class OfflineSyncService {
    private let store: any OfflineActionQueueStoring
    private let client: any OfflineIssueCommentPosting & OfflineIssueStateUpdating

    private(set) var isSyncing = false
    private(set) var actions: [QueuedOfflineAction] = []
    private(set) var pendingCount = 0
    private(set) var failedCount = 0

    init(
        store: any OfflineActionQueueStoring = OfflineActionQueueStore(),
        client: any OfflineIssueCommentPosting & OfflineIssueStateUpdating
    ) {
        self.store = store
        self.client = client
        refreshCounts()
    }

    @discardableResult
    func enqueueIssueComment(
        owner: String,
        repo: String,
        issueNumber: Int,
        body: String
    ) -> QueuedOfflineAction {
        let action = store.enqueueIssueComment(
            owner: owner,
            repo: repo,
            issueNumber: issueNumber,
            body: body,
            id: nil,
            now: Date()
        )
        refreshCounts()
        return action
    }

    @discardableResult
    func enqueueIssueState(
        owner: String,
        repo: String,
        issueNumber: Int,
        state: String,
        comment: String? = nil
    ) -> QueuedOfflineAction {
        let action = store.enqueueIssueState(
            owner: owner,
            repo: repo,
            issueNumber: issueNumber,
            state: state,
            comment: comment,
            id: nil,
            now: Date()
        )
        refreshCounts()
        return action
    }

    func retryFailedActions() {
        for action in store.failedActions() {
            _ = store.markPending(id: action.id, now: Date())
        }
        refreshCounts()
    }

    func clearFailedActions() {
        store.removeFailedActions()
        refreshCounts()
    }

    func removeAction(id: String) {
        store.remove(id: id)
        refreshCounts()
    }

    func refreshCounts() {
        actions = store.allActions()
        pendingCount = actions.filter { $0.status == .pending }.count
        failedCount = actions.filter { $0.status == .failed }.count
    }

    @discardableResult
    func syncPendingActions() async -> OfflineSyncResult {
        guard !isSyncing else {
            return .alreadyRunning
        }

        isSyncing = true
        defer {
            isSyncing = false
            refreshCounts()
        }

        let actions = store.pendingActions()
        var attempted = 0
        var completed = 0
        var failed = 0

        for action in actions {
            attempted += 1
            _ = store.markInFlight(id: action.id, now: Date())

            do {
                let success = try await replay(action)
                if success {
                    store.markCompleted(id: action.id)
                    completed += 1
                }
            } catch {
                _ = store.markFailed(id: action.id, error: Self.failureMessage(for: error), now: Date())
                failed += 1
            }
        }

        return OfflineSyncResult(
            attempted: attempted,
            completed: completed,
            failed: failed,
            alreadyRunning: false
        )
    }

    private func replay(_ action: QueuedOfflineAction) async throws -> Bool {
        switch action.kind {
        case .issueComment(let comment):
            let response = try await client.commentOnIssue(
                owner: comment.owner,
                repo: comment.repo,
                number: comment.issueNumber,
                body: IssueCommentRequestBody(body: comment.body)
            )
            if !response.success {
                throw OfflineSyncFailure.message(Self.failureMessage(from: response))
            }
            return true

        case .issueState(let issueState):
            let response = try await client.updateIssueState(
                owner: issueState.owner,
                repo: issueState.repo,
                number: issueState.issueNumber,
                body: IssueStateRequestBody(state: issueState.state, comment: issueState.comment)
            )
            if !response.success {
                throw OfflineSyncFailure.message(Self.failureMessage(from: response))
            }
            return true
        }
    }

    @discardableResult
    func requestSync() -> Task<OfflineSyncResult, Never> {
        Task { @MainActor in
            await syncPendingActions()
        }
    }

    private static func failureMessage(for error: Error) -> String {
        let localized = error.localizedDescription
        if !localized.isEmpty {
            return localized
        }

        let message = String(describing: error)
        return message.isEmpty ? "Issue comment sync failed" : message
    }

    private static func failureMessage(from response: IssueCommentResponse) -> String {
        guard let error = response.error, !error.isEmpty else {
            return "Issue comment sync failed"
        }
        return error
    }

    private static func failureMessage(from response: IssueStateResponse) -> String {
        guard let error = response.error, !error.isEmpty else {
            return "Issue state sync failed"
        }
        return error
    }
}

private enum OfflineSyncFailure: LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self {
        case .message(let message):
            message
        }
    }
}
