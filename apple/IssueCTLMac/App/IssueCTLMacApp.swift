import AppKit
import SwiftUI

@main
struct IssueCTLMacApp: App {
    @NSApplicationDelegateAdaptor(MacAppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            MacSettingsView()
                .environment(appDelegate.apiClient)
                .environment(appDelegate.sidebarPreferences)
                .environment(appDelegate.sidebarCoordinator)
                .environment(\.resetSidebarLayout) {
                    appDelegate.resetSidebarLayout()
                }
        }
    }
}

@MainActor
final class MacAppDelegate: NSObject, NSApplicationDelegate {
    let apiClient = APIClient()
    let sidebarPreferences = MacSidebarPreferences()
    lazy var sidebarCoordinator = SpaceSidebarCoordinator(
        apiClient: apiClient,
        preferences: sidebarPreferences,
        networkMonitor: networkMonitor
    )
    private let networkMonitor = NetworkMonitor()
    private var statusItem: NSStatusItem?
    private var settingsWindowController: NSWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        PerformanceTrace.markAppLaunchStarted()
        NSApp.setActivationPolicy(.accessory)
        configureUITestFixtureAPIIfNeeded()
        sidebarCoordinator.start()
        configureStatusItem()
    }

    private func configureUITestFixtureAPIIfNeeded() {
        let env = ProcessInfo.processInfo.environment
        guard env["ISSUECTL_UI_TESTING"] == "1",
              env["ISSUECTL_MAC_UI_FIXTURE_API"] == "1" else {
            return
        }
        if let bundleIdentifier = Bundle.main.bundleIdentifier {
            UserDefaults.standard.removePersistentDomain(forName: bundleIdentifier)
        }
        URLProtocol.registerClass(MacUITestFixtureURLProtocol.self)
    }

    private func configureStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.image = NSImage(systemSymbolName: "list.bullet.rectangle", accessibilityDescription: "IssueCTL")
        item.button?.imagePosition = .imageOnly
        item.button?.toolTip = "IssueCTL"

        let menu = NSMenu()
        menu.delegate = self
        menu.addItem(NSMenuItem(title: "Show Current Desktop Sidebar", action: #selector(showCurrentSpaceSidebar), keyEquivalent: "s"))
        menu.addItem(NSMenuItem(title: "Hide Current Desktop Sidebar", action: #selector(hideCurrentSpaceSidebar), keyEquivalent: "w"))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Settings...", action: #selector(openSettings), keyEquivalent: ","))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit IssueCTL", action: #selector(quit), keyEquivalent: "q"))
        menu.items.forEach { $0.target = self }
        item.menu = menu

        statusItem = item
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        sidebarCoordinator.refreshCurrentSpace()
        menu.removeAllItems()
        let currentTitle = sidebarCoordinator.currentSpaceState?.title ?? "Current Desktop"
        menu.addItem(NSMenuItem(title: "Show \(currentTitle) Sidebar", action: #selector(showCurrentSpaceSidebar), keyEquivalent: "s"))
        menu.addItem(NSMenuItem(title: "Hide \(currentTitle) Sidebar", action: #selector(hideCurrentSpaceSidebar), keyEquivalent: "w"))
        menu.addItem(.separator())

        for state in sidebarCoordinator.spaceStates {
            let spaceMenu = NSMenu()
            spaceMenu.addItem(NSMenuItem(
                title: state.chrome.isVisible ? "Hide Sidebar" : "Show Sidebar",
                action: #selector(toggleSpaceVisibility(_:)),
                keyEquivalent: ""
            ))
            spaceMenu.addItem(NSMenuItem(
                title: state.chrome.isCollapsed ? "Expand Sidebar" : "Collapse Sidebar",
                action: #selector(toggleSpaceCollapsed(_:)),
                keyEquivalent: ""
            ))
            spaceMenu.addItem(NSMenuItem(title: "Reset Layout", action: #selector(resetSpaceLayout(_:)), keyEquivalent: ""))
            spaceMenu.items.forEach {
                $0.target = self
                $0.representedObject = state.id
            }

            let item = NSMenuItem(title: state.title, action: nil, keyEquivalent: "")
            item.submenu = spaceMenu
            menu.addItem(item)
        }

        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Reset All Sidebar Layouts", action: #selector(resetAllSidebarLayouts), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Settings...", action: #selector(openSettings), keyEquivalent: ","))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit IssueCTL", action: #selector(quit), keyEquivalent: "q"))
        menu.items.forEach { $0.target = self }
    }

    @objc private func showCurrentSpaceSidebar() {
        sidebarCoordinator.showCurrentSpace()
    }

    @objc private func hideCurrentSpaceSidebar() {
        sidebarCoordinator.hideCurrentSpace()
    }

    @objc private func toggleSpaceVisibility(_ sender: NSMenuItem) {
        guard let spaceKey = sender.representedObject as? String else { return }
        sidebarCoordinator.toggleVisibility(spaceKey: spaceKey)
    }

    @objc private func toggleSpaceCollapsed(_ sender: NSMenuItem) {
        guard let spaceKey = sender.representedObject as? String else { return }
        sidebarCoordinator.toggleCollapsed(spaceKey: spaceKey)
    }

    @objc private func resetSpaceLayout(_ sender: NSMenuItem) {
        guard let spaceKey = sender.representedObject as? String else { return }
        sidebarCoordinator.resetLayout(spaceKey: spaceKey)
    }

    @objc private func openSettings() {
        let windowController = settingsWindowController ?? makeSettingsWindowController()
        settingsWindowController = windowController
        windowController.showWindow(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    func resetSidebarLayout() {
        sidebarCoordinator.resetAllLayouts()
    }

    @objc private func resetAllSidebarLayouts() {
        resetSidebarLayout()
    }

    private func makeSettingsWindowController() -> NSWindowController {
        let settingsView = MacSettingsView()
            .environment(apiClient)
            .environment(sidebarPreferences)
            .environment(sidebarCoordinator)
            .environment(\.resetSidebarLayout) { [weak self] in
                self?.resetSidebarLayout()
            }
        let hostingController = NSHostingController(rootView: settingsView)
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 500, height: 640),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.contentViewController = hostingController
        window.title = "IssueCTL Settings"
        window.minSize = NSSize(width: 480, height: 520)
        window.isReleasedWhenClosed = false
        window.center()
        return NSWindowController(window: window)
    }
}

extension MacAppDelegate: NSMenuDelegate {}

private final class MacUITestFixtureURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "issuectl-ui-test.local"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let url = request.url else {
            client?.urlProtocol(self, didFailWithError: APIError.invalidResponse)
            return
        }

        if let imageData = Self.fixtureImageData(for: url.path) {
            let response = HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "image/png"]
            )!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: imageData)
            client?.urlProtocolDidFinishLoading(self)
            return
        }

        let payload = Self.payload(for: request)
        let status = payload == nil ? 404 : 200
        let data = Self.jsonData(payload ?? ["error": "Unhandled \(url.path)"])

        let response = HTTPURLResponse(
            url: url,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static func payload(for request: URLRequest) -> [String: Any]? {
        let method = request.httpMethod ?? "GET"
        let path = request.url?.path ?? "/"

        switch (method, path) {
        case ("GET", "/api/v1/health"):
            return ["ok": true, "version": "ui-test", "timestamp": isoDate]
        case ("GET", "/api/v1/user"):
            return ["login": "alice"]
        case ("GET", "/api/v1/settings"):
            return ["settings": [
                "cache_ttl": "300",
                "launch_agent": "codex",
                "claude_extra_args": "",
                "codex_extra_args": "",
                "idle_grace_period": "30",
                "idle_threshold": "120",
                "branch_pattern": "jeremy/{slug}",
                "worktree_dir": "/tmp/issuectl-worktrees",
                "default_repo_id": "1",
            ]]
        case ("PATCH", "/api/v1/settings"):
            return ["success": true, "error": NSNull()]
        case ("GET", "/api/v1/repos"):
            return ["repos": [repo, betaRepo]]
        case ("GET", "/api/v1/worktrees"):
            return ["worktrees": worktrees]
        case ("POST", "/api/v1/worktrees/cleanup"):
            if ProcessInfo.processInfo.environment["ISSUECTL_MAC_UI_FIXTURE_WORKTREE_CLEANUP_FAILURE"] == "1" {
                return ["success": false, "error": "Fixture cleanup failed"]
            }
            let payload = jsonBody(from: request)
            if let path = payload["path"] as? String {
                worktrees.removeAll { $0["path"] as? String == path }
                return ["success": true, "error": NSNull()]
            }
            let staleCount = worktrees.filter { ($0["stale"] as? Bool) == true }.count
            worktrees.removeAll { ($0["stale"] as? Bool) == true }
            return ["success": true, "removed": staleCount, "error": NSNull()]
        case ("GET", "/api/v1/repos/github"):
            return ["repos": [
                ["owner": "org", "name": "alpha", "private": false, "pushed_at": isoDate],
                ["owner": "org", "name": "gamma", "private": true, "pushed_at": isoDate],
            ], "synced_at": 1_775_000_000, "is_stale": false]
        case ("GET", "/api/v1/deployments"):
            return ["deployments": [
                [
                    "id": 2,
                    "repo_id": 1,
                    "issue_number": 2,
                    "branch_name": "issue-2-running",
                    "workspace_mode": "worktree",
                    "workspace_path": "/tmp/issue-2",
                    "linked_pr_number": NSNull(),
                    "state": "active",
                    "launched_at": isoDate,
                    "ended_at": NSNull(),
                    "ttyd_port": NSNull(),
                    "ttyd_pid": NSNull(),
                    "owner": "org",
                    "repo_name": "alpha",
                ],
            ]]
        case ("GET", "/api/v1/sessions/previews"):
            return ["previews": []]
        case ("POST", "/api/v1/images/upload"):
            if ProcessInfo.processInfo.environment["ISSUECTL_MAC_UI_FIXTURE_IMAGE_UPLOAD_FAILURE"] == "1" {
                return ["error": "Fixture image upload failed"]
            }
            return ["url": "https://issuectl-ui-test.local/fixtures/uploaded.png"]
        case ("GET", "/api/v1/drafts"):
            return ["drafts": drafts]
        case ("POST", "/api/v1/drafts"):
            let payload = jsonBody(from: request)
            quickCreatedIssueTitle = payload["title"] as? String ?? "Untitled quick issue"
            quickCreatedIssueBody = payload["body"] as? String
            return ["success": true, "id": "quick-draft-1", "error": NSNull()]
        case ("POST", "/api/v1/drafts/draft-1/assign"):
            if ProcessInfo.processInfo.environment["ISSUECTL_MAC_UI_FIXTURE_DRAFT_ASSIGN_FAILURE"] == "1" {
                return ["success": false, "error": "Fixture draft assignment failed"]
            }
            draftAssignmentLabels = jsonBody(from: request)["labels"] as? [String] ?? []
            draftAssignedIssueNumber = 88
            return [
                "success": true,
                "issue_number": 88,
                "issue_url": "https://github.com/org/alpha/issues/88",
                "cleanup_warning": NSNull(),
                "labels_warning": NSNull(),
                "error": NSNull(),
            ]
        case ("POST", "/api/v1/drafts/quick-draft-1/assign"):
            if ProcessInfo.processInfo.environment["ISSUECTL_MAC_UI_FIXTURE_QUICK_CREATE_FAILURE"] == "1" {
                return ["success": false, "error": "Fixture quick create failed"]
            }
            quickCreatedIssueLabels = jsonBody(from: request)["labels"] as? [String] ?? []
            quickCreatedIssueNumber = 89
            return [
                "success": true,
                "issue_number": 89,
                "issue_url": "https://github.com/org/alpha/issues/89",
                "cleanup_warning": NSNull(),
                "labels_warning": NSNull(),
                "error": NSNull(),
            ]
        case ("GET", "/api/v1/issues/org/alpha"):
            return ["issues": issues, "from_cache": false, "cached_at": NSNull()]
        case ("GET", "/api/v1/issues/org/beta"):
            return ["issues": betaIssues, "from_cache": false, "cached_at": NSNull()]
        case ("GET", "/api/v1/issues/org/alpha/1"):
            return issueDetail()
        case ("GET", "/api/v1/issues/org/alpha/89"):
            return quickCreatedIssueDetail()
        case ("GET", "/api/v1/repos/org/alpha/labels"):
            return ["labels": availableLabels]
        case ("GET", "/api/v1/repos/org/alpha/collaborators"):
            return ["collaborators": [
                ["login": "alice", "avatar_url": "https://example.com/alice.png"],
                ["login": "bob", "avatar_url": "https://example.com/bob.png"],
                ["login": "carol", "avatar_url": "https://example.com/carol.png"],
            ]]
        case ("PATCH", "/api/v1/issues/org/alpha/1"):
            let payload = jsonBody(from: request)
            if let title = payload["title"] as? String {
                detailIssueTitle = title
            }
            if let body = payload["body"] as? String {
                detailIssueBody = body
            }
            return ["success": true, "error": NSNull()]
        case ("POST", "/api/v1/issues/org/alpha/1/labels"):
            let payload = jsonBody(from: request)
            if let label = payload["label"] as? String {
                switch payload["action"] as? String {
                case "remove":
                    detailIssueLabels.removeAll { $0 == label }
                default:
                    if !detailIssueLabels.contains(label) {
                        detailIssueLabels.append(label)
                    }
                }
            }
            return ["success": true, "error": NSNull()]
        case ("PUT", "/api/v1/issues/org/alpha/1/assignees"):
            let payload = jsonBody(from: request)
            if let assignees = payload["assignees"] as? [String] {
                detailIssueAssignees = assignees
            }
            return ["assignees": detailIssueAssignees]
        case ("POST", "/api/v1/issues/org/alpha/1/reassign"):
            let payload = jsonBody(from: request)
            let targetOwner = payload["targetOwner"] as? String ?? "org"
            let targetRepo = payload["targetRepo"] as? String ?? "beta"
            reassignedIssueNumber = 77
            detailIssueState = "closed"
            return [
                "success": true,
                "new_issue_number": 77,
                "new_owner": targetOwner,
                "new_repo": targetRepo,
                "cleanup_warning": NSNull(),
                "error": NSNull(),
            ]
        case ("POST", "/api/v1/issues/org/alpha/1/state"):
            let payload = jsonBody(from: request)
            detailIssueState = payload["state"] as? String ?? detailIssueState
            if let comment = payload["comment"] as? String, !comment.isEmpty {
                detailComments.append(commentFixture(id: 500, body: comment, author: "alice"))
            }
            return ["success": true, "error": NSNull()]
        case ("POST", "/api/v1/issues/org/alpha/1/comments"):
            let payload = jsonBody(from: request)
            if let body = payload["body"] as? String {
                detailComments.append(commentFixture(id: 501, body: body, author: "alice"))
            }
            return ["success": true, "comment_id": 501, "error": NSNull()]
        case ("PATCH", "/api/v1/issues/org/alpha/1/comments"):
            let payload = jsonBody(from: request)
            let commentId = payload["comment_id"] as? Int ?? payload["commentId"] as? Int
            if let commentId, let body = payload["body"] as? String,
               let index = detailComments.firstIndex(where: { $0["id"] as? Int == commentId }) {
                detailComments[index] = commentFixture(id: commentId, body: body, author: "alice")
            }
            return ["success": true, "error": NSNull()]
        case ("DELETE", "/api/v1/issues/org/alpha/1/comments"):
            let payload = jsonBody(from: request)
            let commentId = payload["comment_id"] as? Int ?? payload["commentId"] as? Int
            if let commentId {
                detailComments.removeAll { $0["id"] as? Int == commentId }
            }
            return ["success": true, "error": NSNull()]
        case ("GET", "/api/v1/issues/org/alpha/priorities"):
            return ["priorities": [
                ["repo_id": 1, "issue_number": 1, "priority": "low", "updated_at": 1_775_000_000],
                ["repo_id": 1, "issue_number": 3, "priority": "high", "updated_at": 1_775_000_000],
            ]]
        default:
            return nil
        }
    }

    private static var repo: [String: Any] {
        [
            "id": 1,
            "owner": "org",
            "name": "alpha",
            "local_path": "/tmp/issuectl-alpha",
            "branch_pattern": "jeremy/{slug}",
            "created_at": isoDate,
        ]
    }

    private static var betaRepo: [String: Any] {
        [
            "id": 2,
            "owner": "org",
            "name": "beta",
            "local_path": "/tmp/issuectl-beta",
            "branch_pattern": "jeremy/{slug}",
            "created_at": isoDate,
        ]
    }

    nonisolated(unsafe) private static var worktrees: [[String: Any]] = [
        [
            "path": "/tmp/alpha-worktree-101",
            "name": "alpha-worktree-101",
            "repo": "alpha",
            "owner": "org",
            "local_path": "/tmp/issuectl-alpha",
            "issue_number": 101,
            "stale": false,
        ],
        [
            "path": "/tmp/alpha-worktree-stale",
            "name": "alpha-worktree-stale",
            "repo": "alpha",
            "owner": "org",
            "local_path": "/tmp/issuectl-alpha",
            "issue_number": 102,
            "stale": true,
        ],
    ]

    nonisolated(unsafe) private static var detailIssueTitle = "Open alpha issue"
    nonisolated(unsafe) private static var detailIssueBody = "Searchable **alpha** body\n\n![Alpha diagram](https://issuectl-ui-test.local/fixtures/alpha.png)\n\n```swift\nlet value = 1\n```"
    nonisolated(unsafe) private static var detailIssueState = "open"
    nonisolated(unsafe) private static var detailIssueLabels = ["bug"]
    nonisolated(unsafe) private static var detailIssueAssignees = ["bob"]
    nonisolated(unsafe) private static var reassignedIssueNumber: Int?
    nonisolated(unsafe) private static var draftAssignedIssueNumber: Int?
    nonisolated(unsafe) private static var draftAssignmentLabels: [String] = []
    nonisolated(unsafe) private static var quickCreatedIssueNumber: Int?
    nonisolated(unsafe) private static var quickCreatedIssueTitle = "Quick created issue"
    nonisolated(unsafe) private static var quickCreatedIssueBody: String?
    nonisolated(unsafe) private static var quickCreatedIssueLabels: [String] = []
    nonisolated(unsafe) private static var detailComments: [[String: Any]] = [
        commentFixture(id: 101, body: "Alice **own** comment", author: "alice"),
        commentFixture(id: 102, body: "Bob comment with missing image ![Missing image](https://issuectl-ui-test.local/fixtures/missing.png)", author: "bob"),
    ]

    private static var drafts: [[String: Any]] {
        guard draftAssignedIssueNumber == nil else { return [] }
        return [
            [
                "id": "draft-1",
                "title": "Draft offline idea",
                "body": "draft body",
                "priority": "normal",
                "created_at": 1_775_000_000,
            ],
        ]
    }

    private static var issues: [[String: Any]] {
        [
            issue(number: 1, title: detailIssueTitle, body: detailIssueBody, state: detailIssueState, labels: detailIssueLabels, assignees: detailIssueAssignees, author: "alice", updatedAt: "2026-05-14T10:00:00.000Z"),
            issue(number: 2, title: "Running alpha issue", body: "Has an active session", state: "open", assignees: ["alice"], author: "bob", updatedAt: "2026-05-14T11:00:00.000Z"),
            issue(number: 3, title: "Unassigned high priority", body: "Needs owner", state: "open", assignees: [], author: "alice", updatedAt: "2026-05-14T12:00:00.000Z"),
            issue(number: 4, title: "Closed alpha issue", body: "Done", state: "closed", assignees: [], author: "bob", updatedAt: "2026-05-14T13:00:00.000Z"),
        ] + assignedDraftIssues + quickCreatedIssues + (5...55).map { number in
            issue(
                number: number,
                title: "Paged issue \(number)",
                body: "Pagination fixture",
                state: "open",
                assignees: ["alice"],
                author: number.isMultiple(of: 2) ? "alice" : "bob",
                updatedAt: String(format: "2026-05-13T%02d:00:00.000Z", number % 24)
            )
        }
    }

    private static var quickCreatedIssues: [[String: Any]] {
        guard let quickCreatedIssueNumber else { return [] }
        return [
            issue(
                number: quickCreatedIssueNumber,
                title: quickCreatedIssueTitle,
                body: quickCreatedIssueBody ?? "",
                state: "open",
                labels: quickCreatedIssueLabels,
                assignees: ["alice"],
                author: "alice",
                updatedAt: "2026-05-14T16:00:00.000Z"
            ),
        ]
    }

    private static var assignedDraftIssues: [[String: Any]] {
        guard let draftAssignedIssueNumber else { return [] }
        return [
            issue(
                number: draftAssignedIssueNumber,
                title: "Draft offline idea",
                body: "draft body",
                state: "open",
                labels: draftAssignmentLabels,
                assignees: ["alice"],
                author: "alice",
                updatedAt: "2026-05-14T15:00:00.000Z"
            ),
        ]
    }

    private static var betaIssues: [[String: Any]] {
        guard let reassignedIssueNumber else { return [] }
        return [
            issue(
                number: reassignedIssueNumber,
                title: detailIssueTitle,
                body: detailIssueBody,
                state: "open",
                labels: detailIssueLabels,
                assignees: detailIssueAssignees,
                author: "alice",
                updatedAt: isoDate
            ),
        ]
    }

    private static func issue(
        number: Int,
        title: String,
        body: String,
        state: String,
        labels: [String] = [],
        assignees: [String],
        author: String,
        updatedAt: String
    ) -> [String: Any] {
        [
            "number": number,
            "title": title,
            "body": body,
            "state": state,
            "labels": labels.map(labelFixture),
            "assignees": assignees.map { ["login": $0, "avatar_url": "https://example.com/\($0).png"] },
            "user": ["login": author, "avatar_url": "https://example.com/\(author).png"],
            "comment_count": 0,
            "created_at": "2026-05-12T10:00:00.000Z",
            "updated_at": updatedAt,
            "closed_at": state == "closed" ? "2026-05-14T14:00:00.000Z" : NSNull(),
            "html_url": "https://github.com/org/alpha/issues/\(number)",
        ]
    }

    private static func issueDetail() -> [String: Any] {
        [
            "issue": issue(number: 1, title: detailIssueTitle, body: detailIssueBody, state: detailIssueState, labels: detailIssueLabels, assignees: detailIssueAssignees, author: "alice", updatedAt: isoDate),
            "comments": detailComments,
            "deployments": [
                [
                    "id": 9,
                    "repo_id": 1,
                    "issue_number": 1,
                    "branch_name": "issue-1-active",
                    "workspace_mode": "worktree",
                    "workspace_path": "/tmp/issue-1",
                    "linked_pr_number": 7,
                    "state": "active",
                    "launched_at": isoDate,
                    "ended_at": NSNull(),
                    "ttyd_port": 7681,
                    "ttyd_pid": 1234,
                ],
            ],
            "linkedPRs": [
                [
                    "number": 7,
                    "title": "Fix alpha detail",
                    "body": "Linked PR",
                    "state": "open",
                    "draft": false,
                    "merged": false,
                    "user": ["login": "alice", "avatar_url": "https://example.com/alice.png"],
                    "head_ref": "fix-alpha-detail",
                    "base_ref": "main",
                    "additions": 12,
                    "deletions": 3,
                    "changed_files": 2,
                    "created_at": isoDate,
                    "updated_at": isoDate,
                    "merged_at": NSNull(),
                    "closed_at": NSNull(),
                    "html_url": "https://github.com/org/alpha/pull/7",
                    "checks_status": "success",
                ],
            ],
            "referencedFiles": [],
            "fromCache": false,
            "cachedAt": NSNull(),
        ]
    }

    private static func quickCreatedIssueDetail() -> [String: Any] {
        [
            "issue": issue(
                number: 89,
                title: quickCreatedIssueTitle,
                body: quickCreatedIssueBody ?? "",
                state: "open",
                labels: quickCreatedIssueLabels,
                assignees: ["alice"],
                author: "alice",
                updatedAt: isoDate
            ),
            "comments": [],
            "deployments": [],
            "linkedPRs": [],
            "referencedFiles": [],
            "fromCache": false,
            "cachedAt": NSNull(),
        ]
    }

    private static func commentFixture(id: Int, body: String, author: String) -> [String: Any] {
        [
            "id": id,
            "body": body,
            "user": ["login": author, "avatar_url": "https://example.com/\(author).png"],
            "created_at": isoDate,
            "updated_at": isoDate,
            "html_url": "https://github.com/org/alpha/issues/1#issuecomment-\(id)",
        ]
    }

    private static func fixtureImageData(for path: String) -> Data? {
        guard path == "/fixtures/alpha.png" || path == "/fixtures/uploaded.png" else { return nil }
        return Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAqADAAQAAAABAAAAAgAAAADtGLyqAAAAEklEQVQIHWP8DwQMQMAEIkAAAD34BACALvQ5AAAAAElFTkSuQmCC")
    }

    private static var availableLabels: [[String: Any]] {
        [
            labelFixture("bug"),
            labelFixture("enhancement"),
            labelFixture("docs"),
        ]
    }

    private static func labelFixture(_ name: String) -> [String: Any] {
        let colors = [
            "bug": "d73a4a",
            "enhancement": "a2eeef",
            "docs": "0075ca",
        ]
        let descriptions = [
            "bug": "Something is not working",
            "enhancement": "New feature or request",
            "docs": "Documentation",
        ]
        return [
            "name": name,
            "color": colors[name] ?? "6a737d",
            "description": descriptions[name] ?? NSNull(),
        ]
    }

    private static var isoDate: String {
        "2026-05-14T00:00:00Z"
    }

    private static func jsonData(_ object: Any) -> Data {
        (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
    }

    private static func jsonBody(from request: URLRequest) -> [String: Any] {
        let data: Data?
        if let body = request.httpBody {
            data = body
        } else if let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }

            var body = Data()
            let bufferSize = 1_024
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
            defer { buffer.deallocate() }

            while stream.hasBytesAvailable {
                let bytesRead = stream.read(buffer, maxLength: bufferSize)
                if bytesRead > 0 {
                    body.append(buffer, count: bytesRead)
                } else {
                    break
                }
            }
            data = body
        } else {
            data = nil
        }

        guard let data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        return json
    }
}
