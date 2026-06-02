import XCTest
@testable import IssueCTL

@MainActor
final class WorkbenchStoreTests: XCTestCase {
    func testBoardSectionsMatchWebDashboardContract() {
        let store = WorkbenchStore()
        store.payload = WorkbenchStoreTests.payload(issues: [
            WorkbenchStoreTests.issue(number: 1, title: "Open work", state: "open", hasActiveDeployment: false),
            WorkbenchStoreTests.issue(number: 2, title: "Running work", state: "open", hasActiveDeployment: true),
            WorkbenchStoreTests.issue(number: 3, title: "Closed work", state: "closed", hasActiveDeployment: false),
        ])

        XCTAssertEqual(WorkbenchIssueFilter.allCases.map(\.rawValue), ["unassigned", "open", "running", "closed"])

        XCTAssertEqual(store.counts[.open], 1)
        XCTAssertEqual(store.counts[.running], 1)
        XCTAssertEqual(store.counts[.closed], 1)

        store.filter = .open
        XCTAssertEqual(store.visibleIssues.map(\.issue.number), [1])

        store.filter = .running
        XCTAssertEqual(store.visibleIssues.map(\.issue.number), [2])
    }

    func testDraftsPreserveWorkbenchPayloadOrder() {
        let store = WorkbenchStore()
        store.payload = WorkbenchStoreTests.payload(
            drafts: [
                Draft(id: "recent-edit", title: "Recently edited", body: nil, priority: .low, createdAt: 1),
                Draft(id: "older-high", title: "Older high priority", body: nil, priority: .high, createdAt: 2),
            ],
            issues: []
        )

        store.filter = .unassigned

        XCTAssertEqual(store.counts[.unassigned], 2)
        XCTAssertEqual(store.visibleDrafts.map(\.id), ["recent-edit", "older-high"])
    }

    func testBoardRouteSelectsRepoAndIssueFilter() {
        let store = WorkbenchStore()
        store.payload = WorkbenchStoreTests.payload(
            issues: [
                WorkbenchStoreTests.issue(number: 1, title: "Open work", state: "open", hasActiveDeployment: false),
                WorkbenchStoreTests.issue(number: 2, title: "Running work", state: "open", hasActiveDeployment: true),
                WorkbenchStoreTests.issue(number: 3, title: "Closed work", state: "closed", hasActiveDeployment: false),
            ]
        )

        let focus = store.applyBoardRoute(repoFullName: "org/app", issueNumber: 2, deploymentId: nil)

        XCTAssertEqual(focus, WorkbenchBoardFocus(owner: "org", repo: "app", number: 2))
        XCTAssertEqual(store.selectedRepoIds, [1])
        XCTAssertEqual(store.filter, .running)
    }

    func testBoardRouteCanFocusIssueByDeployment() {
        let store = WorkbenchStore()
        store.payload = WorkbenchStoreTests.payload(
            issues: [
                WorkbenchStoreTests.issue(number: 2, title: "Running work", state: "open", hasActiveDeployment: true),
            ],
            deployments: [
                WorkbenchStoreTests.deployment(id: 701, issueNumber: 2),
            ]
        )

        let focus = store.applyBoardRoute(repoFullName: nil, issueNumber: nil, deploymentId: 701)

        XCTAssertEqual(focus, WorkbenchBoardFocus(owner: "org", repo: "app", number: 2))
        XCTAssertEqual(store.selectedRepoIds, [1])
        XCTAssertEqual(store.filter, .running)
    }

    private static func payload(
        drafts: [Draft] = [],
        issues: [WorkbenchIssueSummary],
        deployments: [ActiveDeployment] = []
    ) -> WorkbenchPayload {
        WorkbenchPayload(
            drafts: drafts,
            repos: [
                WorkbenchRepo(
                    id: 1,
                    owner: "org",
                    name: "app",
                    localPath: nil,
                    branchPattern: nil,
                    autoLaunchIssues: false,
                    autoReviewPrs: false,
                    issueAgent: .codex,
                    reviewAgent: .codex,
                    webhookId: nil,
                    webhookPayloadMode: .metadata,
                    badgeCount: 0,
                    deployedCount: 0,
                    launchAgent: nil,
                    terminalBackendDefault: .ttyd,
                    issueError: nil,
                    issuesFromCache: false,
                    issuesCachedAt: nil,
                    priorities: [],
                    deployments: deployments,
                    recentCompletions: [],
                    webhookEvents: [],
                    prReviews: [],
                    previews: [:],
                    issues: issues
                ),
            ],
            deployments: [],
            previews: [:],
            settings: [:],
            health: WorkbenchHealth(ok: true, version: "1", timestamp: nil, error: nil),
            user: WorkbenchUser(login: "tester", error: nil),
            generatedAt: "2026-05-29T00:00:00.000Z"
        )
    }

    private static func issue(
        number: Int,
        title: String,
        state: String,
        hasActiveDeployment: Bool
    ) -> WorkbenchIssueSummary {
        WorkbenchIssueSummary(
            number: number,
            title: title,
            state: state,
            labels: [],
            updatedAt: "2026-05-29T00:00:00.000Z",
            priority: .normal,
            hasActiveDeployment: hasActiveDeployment,
            htmlUrl: "https://github.com/org/app/issues/\(number)",
            authorLogin: "tester"
        )
    }

    private static func deployment(id: Int, issueNumber: Int) -> ActiveDeployment {
        ActiveDeployment(
            id: id,
            repoId: 1,
            issueNumber: issueNumber,
            targetType: .issue,
            targetNumber: issueNumber,
            agent: .codex,
            terminalBackend: .ttyd,
            triggeredBy: .manual,
            parentDeploymentId: nil,
            webhookDepth: 0,
            idleSince: nil,
            branchName: "issue-\(issueNumber)-running-work",
            workspaceMode: .worktree,
            workspacePath: "/tmp/app/.worktrees/issue-\(issueNumber)",
            linkedPrNumber: nil,
            state: .active,
            launchedAt: "2026-05-29T00:00:00.000Z",
            endedAt: nil,
            ttydPort: 7701,
            ttydPid: 1234,
            owner: "org",
            repoName: "app"
        )
    }
}
