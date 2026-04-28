import XCTest
@testable import IssueCTL

final class EnumTests: XCTestCase {

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    private let encoder = JSONEncoder()

    // MARK: - WorkspaceMode

    func testWorkspaceModeAllCasesDecoding() throws {
        for mode in WorkspaceMode.allCases {
            let json = "\"\(mode.rawValue)\"".data(using: .utf8)!
            let decoded = try decoder.decode(WorkspaceMode.self, from: json)
            XCTAssertEqual(decoded, mode)
        }
    }

    func testWorkspaceModeRawValues() {
        XCTAssertEqual(WorkspaceMode.clone.rawValue, "clone")
        XCTAssertEqual(WorkspaceMode.worktree.rawValue, "worktree")
        XCTAssertEqual(WorkspaceMode.existing.rawValue, "existing")
    }

    func testWorkspaceModeEncoding() throws {
        for mode in WorkspaceMode.allCases {
            let data = try encoder.encode(mode)
            let str = String(data: data, encoding: .utf8)!
            XCTAssertEqual(str, "\"\(mode.rawValue)\"")
        }
    }

    func testWorkspaceModeRoundTrip() throws {
        for mode in WorkspaceMode.allCases {
            let data = try encoder.encode(mode)
            let decoded = try decoder.decode(WorkspaceMode.self, from: data)
            XCTAssertEqual(decoded, mode)
        }
    }

    func testWorkspaceModeUnknownValueThrows() {
        let json = "\"branch\"".data(using: .utf8)!
        XCTAssertThrowsError(try decoder.decode(WorkspaceMode.self, from: json))
    }

    func testWorkspaceModeCaseIterable() {
        XCTAssertEqual(WorkspaceMode.allCases.count, 3)
        XCTAssertTrue(WorkspaceMode.allCases.contains(.clone))
        XCTAssertTrue(WorkspaceMode.allCases.contains(.worktree))
        XCTAssertTrue(WorkspaceMode.allCases.contains(.existing))
    }

    // MARK: - DeploymentState

    func testDeploymentStateRawValues() {
        XCTAssertEqual(DeploymentState.active.rawValue, "active")
        XCTAssertEqual(DeploymentState.ended.rawValue, "ended")
    }

    func testDeploymentStateDecoding() throws {
        let activeJSON = "\"active\"".data(using: .utf8)!
        let endedJSON = "\"ended\"".data(using: .utf8)!

        XCTAssertEqual(try decoder.decode(DeploymentState.self, from: activeJSON), .active)
        XCTAssertEqual(try decoder.decode(DeploymentState.self, from: endedJSON), .ended)
    }

    func testDeploymentStateEncoding() throws {
        let activeData = try encoder.encode(DeploymentState.active)
        let endedData = try encoder.encode(DeploymentState.ended)

        XCTAssertEqual(String(data: activeData, encoding: .utf8), "\"active\"")
        XCTAssertEqual(String(data: endedData, encoding: .utf8), "\"ended\"")
    }

    func testDeploymentStateRoundTrip() throws {
        for state in [DeploymentState.active, DeploymentState.ended] {
            let data = try encoder.encode(state)
            let decoded = try decoder.decode(DeploymentState.self, from: data)
            XCTAssertEqual(decoded, state)
        }
    }

    func testDeploymentStateUnknownValueThrows() {
        let json = "\"paused\"".data(using: .utf8)!
        XCTAssertThrowsError(try decoder.decode(DeploymentState.self, from: json))
    }

    func testDeploymentStateIsActiveOnDeployment() throws {
        // active state with no endedAt -> isActive
        let activeJSON = """
        {
            "id": 1, "repo_id": 1, "issue_number": 1,
            "branch_name": "b", "workspace_mode": "worktree",
            "workspace_path": "/tmp", "linked_pr_number": null,
            "state": "active",
            "launched_at": "2026-04-27T08:00:00Z", "ended_at": null,
            "ttyd_port": 7682, "ttyd_pid": 100
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(Deployment.self, from: activeJSON)
        XCTAssertTrue(deployment.isActive)
        XCTAssertEqual(deployment.state, .active)

        // ended state with endedAt -> not isActive
        let endedJSON = """
        {
            "id": 2, "repo_id": 1, "issue_number": 1,
            "branch_name": "b", "workspace_mode": "worktree",
            "workspace_path": "/tmp", "linked_pr_number": null,
            "state": "ended",
            "launched_at": "2026-04-27T08:00:00Z", "ended_at": "2026-04-27T10:00:00Z",
            "ttyd_port": null, "ttyd_pid": null
        }
        """.data(using: .utf8)!

        let ended = try decoder.decode(Deployment.self, from: endedJSON)
        XCTAssertFalse(ended.isActive)
        XCTAssertEqual(ended.state, .ended)
    }

    func testDeploymentStateActiveButEndedAtPresent() throws {
        // Edge case: state is "active" but endedAt is non-nil
        // isActive requires state == .active AND endedAt == nil
        let json = """
        {
            "id": 3, "repo_id": 1, "issue_number": 1,
            "branch_name": "b", "workspace_mode": "worktree",
            "workspace_path": "/tmp", "linked_pr_number": null,
            "state": "active",
            "launched_at": "2026-04-27T08:00:00Z", "ended_at": "2026-04-27T09:00:00Z",
            "ttyd_port": null, "ttyd_pid": null
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(Deployment.self, from: json)
        XCTAssertFalse(deployment.isActive, "Should not be active when endedAt is non-nil even if state is active")
    }

    // MARK: - Priority

    func testPriorityAllCasesDecoding() throws {
        for priority in Priority.allCases {
            let json = "\"\(priority.rawValue)\"".data(using: .utf8)!
            let decoded = try decoder.decode(Priority.self, from: json)
            XCTAssertEqual(decoded, priority)
        }
    }

    func testPriorityRawValues() {
        XCTAssertEqual(Priority.low.rawValue, "low")
        XCTAssertEqual(Priority.normal.rawValue, "normal")
        XCTAssertEqual(Priority.high.rawValue, "high")
    }

    func testPriorityEncoding() throws {
        for priority in Priority.allCases {
            let data = try encoder.encode(priority)
            let str = String(data: data, encoding: .utf8)!
            XCTAssertEqual(str, "\"\(priority.rawValue)\"")
        }
    }

    func testPriorityRoundTrip() throws {
        for priority in Priority.allCases {
            let data = try encoder.encode(priority)
            let decoded = try decoder.decode(Priority.self, from: data)
            XCTAssertEqual(decoded, priority)
        }
    }

    func testPrioritySortIndex() {
        XCTAssertEqual(Priority.high.sortIndex, 0)
        XCTAssertEqual(Priority.normal.sortIndex, 1)
        XCTAssertEqual(Priority.low.sortIndex, 2)

        // Verify sort order: high < normal < low
        let sorted = Priority.allCases.sorted { $0.sortIndex < $1.sortIndex }
        XCTAssertEqual(sorted, [.high, .normal, .low])
    }

    func testPriorityUnknownValueThrows() {
        let json = "\"critical\"".data(using: .utf8)!
        XCTAssertThrowsError(try decoder.decode(Priority.self, from: json))
    }

    func testPriorityCaseIterable() {
        XCTAssertEqual(Priority.allCases.count, 3)
    }

    // MARK: - Enum used in model context

    func testWorkspaceModeInLaunchRequestBody() throws {
        for mode in WorkspaceMode.allCases {
            let body = LaunchRequestBody(
                branchName: "test",
                workspaceMode: mode,
                selectedCommentIndices: [],
                selectedFilePaths: [],
                preamble: nil,
                forceResume: nil,
                idempotencyKey: nil
            )
            let data = try encoder.encode(body)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            XCTAssertEqual(json?["workspaceMode"] as? String, mode.rawValue)
        }
    }

    func testDeploymentStateInActiveDeployment() throws {
        let json = """
        {
            "id": 1, "repo_id": 1, "issue_number": 1,
            "branch_name": "b", "workspace_mode": "clone",
            "workspace_path": "/tmp", "linked_pr_number": null,
            "state": "active",
            "launched_at": "2026-04-27T08:00:00Z", "ended_at": null,
            "ttyd_port": 7682, "ttyd_pid": 100,
            "owner": "org", "repo_name": "app"
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(ActiveDeployment.self, from: json)
        XCTAssertEqual(deployment.state, .active)
        XCTAssertEqual(deployment.workspaceMode, .clone)
        XCTAssertTrue(deployment.isActive)
    }

    func testActiveDeploymentActiveButEndedAtPresent() throws {
        let json = """
        {
            "id": 1, "repo_id": 1, "issue_number": 1,
            "branch_name": "b", "workspace_mode": "clone",
            "workspace_path": "/tmp", "linked_pr_number": null,
            "state": "active",
            "launched_at": "2026-04-27T08:00:00Z", "ended_at": "2026-04-27T09:00:00Z",
            "ttyd_port": 7682, "ttyd_pid": 100,
            "owner": "org", "repo_name": "app"
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(ActiveDeployment.self, from: json)
        XCTAssertFalse(deployment.isActive)
    }

    func testPriorityInDraft() throws {
        let json = """
        {
            "id": "d1", "title": "Test", "body": null,
            "priority": "high", "created_at": 100.0
        }
        """.data(using: .utf8)!

        let draft = try decoder.decode(Draft.self, from: json)
        XCTAssertEqual(draft.priority, .high)
    }

    func testNullPriorityInDraft() throws {
        let json = """
        {
            "id": "d2", "title": "Test", "body": null,
            "priority": null, "created_at": 100.0
        }
        """.data(using: .utf8)!

        let draft = try decoder.decode(Draft.self, from: json)
        XCTAssertNil(draft.priority)
    }
}
