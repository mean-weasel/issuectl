import XCTest
@testable import IssueCTL

@MainActor
final class OfflineSyncServiceTests: XCTestCase {
    func testSyncPendingIssueCommentCompletesSuccessfulAction() async throws {
        let (store, defaults, suiteName) = try makeStore()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        store.enqueueIssueComment(
            owner: "org",
            repo: "app",
            issueNumber: 42,
            body: "Queued comment",
            id: "comment-1",
            now: Date(timeIntervalSince1970: 0)
        )
        let client = FakeIssueCommentClient(responses: [
            .success(IssueCommentResponse(success: true, commentId: 99, error: nil))
        ])
        let service = OfflineSyncService(store: store, client: client)

        let result = await service.syncPendingActions()

        XCTAssertEqual(result, OfflineSyncResult(
            attempted: 1,
            completed: 1,
            failed: 0,
            alreadyRunning: false
        ))
        XCTAssertTrue(store.allActions().isEmpty)
        XCTAssertEqual(service.pendingCount, 0)
        XCTAssertEqual(service.failedCount, 0)
        XCTAssertEqual(client.requests, [
            .issueComment(FakeIssueCommentRequest(owner: "org", repo: "app", number: 42, body: "Queued comment"))
        ])
    }

    func testSyncPendingIssueStateCompletesSuccessfulAction() async throws {
        let (store, defaults, suiteName) = try makeStore()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        store.enqueueIssueState(
            owner: "org",
            repo: "app",
            issueNumber: 42,
            state: "closed",
            comment: "Closing while offline",
            id: "state-1",
            now: Date(timeIntervalSince1970: 0)
        )
        let client = FakeIssueCommentClient(issueStateResponses: [
            .success(IssueStateResponse(success: true, commentPosted: true, error: nil))
        ])
        let service = OfflineSyncService(store: store, client: client)

        let result = await service.syncPendingActions()

        XCTAssertEqual(result, OfflineSyncResult(
            attempted: 1,
            completed: 1,
            failed: 0,
            alreadyRunning: false
        ))
        XCTAssertTrue(store.allActions().isEmpty)
        XCTAssertEqual(service.pendingCount, 0)
        XCTAssertEqual(service.failedCount, 0)
        XCTAssertEqual(client.requests, [
            .issueState(FakeIssueStateRequest(
                owner: "org",
                repo: "app",
                number: 42,
                state: "closed",
                comment: "Closing while offline"
            ))
        ])
    }

    func testSyncMarksActionFailedWhenAPIResponseIsUnsuccessful() async throws {
        let (store, defaults, suiteName) = try makeStore()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        store.enqueueIssueComment(
            owner: "org",
            repo: "app",
            issueNumber: 42,
            body: "Queued comment",
            id: "comment-1",
            now: Date(timeIntervalSince1970: 0)
        )
        let client = FakeIssueCommentClient(responses: [
            .success(IssueCommentResponse(success: false, commentId: nil, error: "GitHub rejected the comment"))
        ])
        let service = OfflineSyncService(store: store, client: client)

        let result = await service.syncPendingActions()

        XCTAssertEqual(result.failed, 1)
        XCTAssertEqual(store.failedActions().map(\.id), ["comment-1"])
        XCTAssertEqual(store.failedActions().first?.lastError, "GitHub rejected the comment")
        XCTAssertEqual(service.pendingCount, 0)
        XCTAssertEqual(service.failedCount, 1)
    }

    func testSyncMarksIssueStateFailedWhenAPIResponseIsUnsuccessful() async throws {
        let (store, defaults, suiteName) = try makeStore()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        store.enqueueIssueState(
            owner: "org",
            repo: "app",
            issueNumber: 42,
            state: "closed",
            comment: nil,
            id: "state-1",
            now: Date(timeIntervalSince1970: 0)
        )
        let client = FakeIssueCommentClient(issueStateResponses: [
            .success(IssueStateResponse(success: false, commentPosted: nil, error: "GitHub rejected the state change"))
        ])
        let service = OfflineSyncService(store: store, client: client)

        let result = await service.syncPendingActions()

        XCTAssertEqual(result.failed, 1)
        XCTAssertEqual(store.failedActions().map(\.id), ["state-1"])
        XCTAssertEqual(store.failedActions().first?.lastError, "GitHub rejected the state change")
        XCTAssertEqual(service.pendingCount, 0)
        XCTAssertEqual(service.failedCount, 1)
    }

    func testSyncMarksIssueStateFailedWhenAPIThrows() async throws {
        let (store, defaults, suiteName) = try makeStore()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        store.enqueueIssueState(
            owner: "org",
            repo: "app",
            issueNumber: 42,
            state: "open",
            comment: nil,
            id: "state-1",
            now: Date(timeIntervalSince1970: 0)
        )
        let client = FakeIssueCommentClient(issueStateResponses: [
            .failure(FakeSyncError(message: "offline state update failed"))
        ])
        let service = OfflineSyncService(store: store, client: client)

        let result = await service.syncPendingActions()

        XCTAssertEqual(result.failed, 1)
        XCTAssertEqual(store.failedActions().map(\.id), ["state-1"])
        XCTAssertEqual(store.failedActions().first?.lastError, "offline state update failed")
        XCTAssertEqual(service.pendingCount, 0)
        XCTAssertEqual(service.failedCount, 1)
    }

    func testSyncReplaysMixedIssueCommentAndStateInFIFOOrder() async throws {
        let (store, defaults, suiteName) = try makeStore()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        store.enqueueIssueComment(
            owner: "org",
            repo: "app",
            issueNumber: 42,
            body: "Queued comment",
            id: "comment-1",
            now: Date(timeIntervalSince1970: 0)
        )
        store.enqueueIssueState(
            owner: "org",
            repo: "app",
            issueNumber: 42,
            state: "closed",
            comment: "Closing comment",
            id: "state-1",
            now: Date(timeIntervalSince1970: 1)
        )
        let client = FakeIssueCommentClient(
            responses: [
                .success(IssueCommentResponse(success: true, commentId: 99, error: nil))
            ],
            issueStateResponses: [
                .success(IssueStateResponse(success: true, commentPosted: true, error: nil))
            ]
        )
        let service = OfflineSyncService(store: store, client: client)

        let result = await service.syncPendingActions()

        XCTAssertEqual(result, OfflineSyncResult(
            attempted: 2,
            completed: 2,
            failed: 0,
            alreadyRunning: false
        ))
        XCTAssertTrue(store.allActions().isEmpty)
        XCTAssertEqual(client.requests, [
            .issueComment(FakeIssueCommentRequest(owner: "org", repo: "app", number: 42, body: "Queued comment")),
            .issueState(FakeIssueStateRequest(
                owner: "org",
                repo: "app",
                number: 42,
                state: "closed",
                comment: "Closing comment"
            ))
        ])
    }

    func testRetryFailedActionsMovesFailuresBackToPending() async throws {
        let (store, defaults, suiteName) = try makeStore()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        store.enqueueIssueComment(
            owner: "org",
            repo: "app",
            issueNumber: 42,
            body: "Queued comment",
            id: "comment-1",
            now: Date(timeIntervalSince1970: 0)
        )
        store.markFailed(id: "comment-1", error: "offline", now: Date(timeIntervalSince1970: 1))
        let service = OfflineSyncService(store: store, client: FakeIssueCommentClient())

        service.retryFailedActions()

        XCTAssertEqual(store.pendingActions().map(\.id), ["comment-1"])
        XCTAssertTrue(store.failedActions().isEmpty)
        XCTAssertEqual(service.pendingCount, 1)
        XCTAssertEqual(service.failedCount, 0)
    }

    func testConcurrentSyncReturnsAlreadyRunning() async throws {
        let (store, defaults, suiteName) = try makeStore()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        store.enqueueIssueComment(
            owner: "org",
            repo: "app",
            issueNumber: 42,
            body: "Queued comment",
            id: "comment-1",
            now: Date(timeIntervalSince1970: 0)
        )
        let client = FakeIssueCommentClient(
            responses: [.success(IssueCommentResponse(success: true, commentId: 99, error: nil))],
            delayNanoseconds: 50_000_000
        )
        let service = OfflineSyncService(store: store, client: client)

        let firstSync = Task { @MainActor in
            await service.syncPendingActions()
        }
        while !service.isSyncing {
            await Task.yield()
        }

        let secondResult = await service.syncPendingActions()
        let firstResult = await firstSync.value

        XCTAssertTrue(secondResult.alreadyRunning)
        XCTAssertEqual(firstResult.completed, 1)
        XCTAssertEqual(client.requests.count, 1)
    }

    private func makeStore() throws -> (OfflineActionQueueStore, UserDefaults, String) {
        let suiteName = "issuectl.tests.offline-sync.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        return (OfflineActionQueueStore(defaults: defaults), defaults, suiteName)
    }
}

private struct FakeIssueCommentRequest: Equatable {
    let owner: String
    let repo: String
    let number: Int
    let body: String
}

private struct FakeIssueStateRequest: Equatable {
    let owner: String
    let repo: String
    let number: Int
    let state: String
    let comment: String?
}

private enum FakeOfflineSyncRequest: Equatable {
    case issueComment(FakeIssueCommentRequest)
    case issueState(FakeIssueStateRequest)
}

private struct FakeSyncError: LocalizedError {
    let message: String

    var errorDescription: String? {
        message
    }
}

@MainActor
private final class FakeIssueCommentClient: OfflineIssueCommentPosting, OfflineIssueStateUpdating {
    private var responses: [Result<IssueCommentResponse, Error>]
    private var issueStateResponses: [Result<IssueStateResponse, Error>]
    private let delayNanoseconds: UInt64
    private(set) var requests: [FakeOfflineSyncRequest] = []

    init(
        responses: [Result<IssueCommentResponse, Error>] = [],
        issueStateResponses: [Result<IssueStateResponse, Error>] = [],
        delayNanoseconds: UInt64 = 0
    ) {
        self.responses = responses
        self.issueStateResponses = issueStateResponses
        self.delayNanoseconds = delayNanoseconds
    }

    func commentOnIssue(
        owner: String,
        repo: String,
        number: Int,
        body: IssueCommentRequestBody
    ) async throws -> IssueCommentResponse {
        requests.append(.issueComment(FakeIssueCommentRequest(owner: owner, repo: repo, number: number, body: body.body)))
        if delayNanoseconds > 0 {
            try await Task.sleep(nanoseconds: delayNanoseconds)
        }
        guard !responses.isEmpty else {
            return IssueCommentResponse(success: true, commentId: nil, error: nil)
        }
        return try responses.removeFirst().get()
    }

    func updateIssueState(
        owner: String,
        repo: String,
        number: Int,
        body: IssueStateRequestBody
    ) async throws -> IssueStateResponse {
        requests.append(.issueState(FakeIssueStateRequest(
            owner: owner,
            repo: repo,
            number: number,
            state: body.state,
            comment: body.comment
        )))
        if delayNanoseconds > 0 {
            try await Task.sleep(nanoseconds: delayNanoseconds)
        }
        guard !issueStateResponses.isEmpty else {
            return IssueStateResponse(success: true, commentPosted: nil, error: nil)
        }
        return try issueStateResponses.removeFirst().get()
    }
}
