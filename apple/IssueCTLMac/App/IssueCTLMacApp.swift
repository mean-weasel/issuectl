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
            return ["repos": [repo]]
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
            return ["deployments": []]
        case ("GET", "/api/v1/sessions/previews"):
            return ["previews": []]
        case ("GET", "/api/v1/drafts"):
            return ["drafts": []]
        case ("GET", "/api/v1/issues/org/alpha"):
            return ["issues": [], "from_cache": false, "cached_at": NSNull()]
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

    private static var isoDate: String {
        "2026-05-14T00:00:00Z"
    }

    private static func jsonData(_ object: Any) -> Data {
        (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
    }

    private static func jsonBody(from request: URLRequest) -> [String: Any] {
        guard let data = request.httpBody,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        return json
    }
}
