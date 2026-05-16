import AppKit
import SwiftUI

@Observable @MainActor
final class MacSidebarSpaceState {
    let slot: Int
    let key: String
    let title: String
    let preferences: MacSidebarDisplayPreferences
    let chrome: SidebarChromeState
    let issueFilterState: MacIssueFilterState
    let pullRequestFilterState: MacPullRequestFilterState
    let sessionFilterState: MacSessionFilterState
    let anchorWindow: MacSidebarSpaceAnchorWindow

    var id: String { key }

    init(slot: Int, preferences: MacSidebarDisplayPreferences) {
        self.slot = slot
        key = Self.key(forSlot: slot)
        title = "Desktop \(slot)"
        self.preferences = preferences
        chrome = SidebarChromeState()
        chrome.isCollapsed = preferences.isCollapsed
        issueFilterState = MacIssueFilterState(preferences: preferences)
        pullRequestFilterState = MacPullRequestFilterState(preferences: preferences)
        sessionFilterState = MacSessionFilterState(preferences: preferences)
        anchorWindow = MacSidebarSpaceAnchorWindow(identifier: key, slot: slot)
    }

    static func key(forSlot slot: Int) -> String {
        "space-slot-\(slot)"
    }
}

@MainActor
final class MacSidebarSpaceAnchorWindow {
    private let window: NSPanel
    private let slot: Int

    init(identifier: String, slot: Int) {
        self.slot = slot
        let frame = NSRect(x: CGFloat(slot), y: 1, width: 1, height: 1)
        window = NSPanel(
            contentRect: frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        window.identifier = NSUserInterfaceItemIdentifier("issuectl.sidebar.anchor.\(identifier)")
        window.backgroundColor = .clear
        window.isOpaque = false
        window.alphaValue = 0.01
        window.hasShadow = false
        window.ignoresMouseEvents = true
        window.hidesOnDeactivate = false
        window.isReleasedWhenClosed = false
        window.level = .normal
        window.collectionBehavior = []
        window.orderFrontRegardless()
    }

    var isVisibleOnActiveSpace: Bool {
        let windowNumber = window.windowNumber
        let windows = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] ?? []
        return windows.contains { candidate in
            guard (candidate[kCGWindowNumber as String] as? Int) == windowNumber else { return false }
            guard (candidate[kCGWindowIsOnscreen as String] as? Int) == 1 else { return false }
            guard let bounds = candidate[kCGWindowBounds as String] as? [String: Any] else { return false }
            return (bounds["Width"] as? Int) == 1
                && (bounds["Height"] as? Int) == 1
                && (bounds["X"] as? Int) == slot
        }
    }

    func close() {
        window.close()
    }
}

@Observable @MainActor
final class SpaceSidebarCoordinator {
    let apiClient: APIClient
    let offlineSync: OfflineSyncService
    let preferences: MacSidebarPreferences
    let networkMonitor: NetworkMonitor
    let store: MacSidebarStore

    private var controllers: [String: SidebarPanelController] = [:]
    private var statesByKey: [String: MacSidebarSpaceState] = [:]
    private var spaceObserver: NSObjectProtocol?
    private var screenObserver: NSObjectProtocol?
    private(set) var spaceStates: [MacSidebarSpaceState] = []
    private(set) var currentSpaceKey: String?

    init(
        apiClient: APIClient,
        offlineSync: OfflineSyncService,
        preferences: MacSidebarPreferences,
        networkMonitor: NetworkMonitor,
        store: MacSidebarStore = MacSidebarStore()
    ) {
        self.apiClient = apiClient
        self.offlineSync = offlineSync
        self.preferences = preferences
        self.networkMonitor = networkMonitor
        self.store = store
    }

    func start() {
        activateCurrentSpace(showNewPanel: true)
        spaceObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.activeSpaceDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.activateCurrentSpace(showNewPanel: true)
            }
        }
        screenObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.realignActiveSpacePanel()
            }
        }
    }

    func stop() {
        if let spaceObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(spaceObserver)
        }
        if let screenObserver {
            NotificationCenter.default.removeObserver(screenObserver)
        }
        spaceObserver = nil
        screenObserver = nil
        controllers.values.forEach { $0.hide() }
        controllers.removeAll()
        spaceStates.forEach { $0.anchorWindow.close() }
        spaceStates.removeAll()
        statesByKey.removeAll()
        currentSpaceKey = nil
    }

    func activateCurrentSpace(showNewPanel: Bool) {
        let state = stateForActiveSpace() ?? createStateForActiveSpace()
        currentSpaceKey = state.id

        if controllers[state.id] == nil {
            let controller = makePanelController(for: state)
            controllers[state.id] = controller
        } else {
            realignActiveSpacePanel()
        }

        hideInactivePanels(activeSpaceKey: state.id)
        if showNewPanel, state.preferences.isEnabled {
            controllers[state.id]?.show()
        }
    }

    func refreshCurrentSpace() {
        activateCurrentSpace(showNewPanel: false)
    }

    func toggleCurrentSpaceVisibility() {
        refreshCurrentSpace()
        guard let state = currentSpaceState else { return }
        toggleVisibility(spaceKey: state.id)
    }

    func toggleVisibility(spaceKey: String) {
        guard let state = statesByKey[spaceKey], let controller = controllers[spaceKey] else { return }
        if state.chrome.isVisible {
            state.preferences.isEnabled = false
            controller.hide()
        } else {
            state.preferences.isEnabled = true
            controller.show()
        }
    }

    func hide(spaceKey: String) {
        statesByKey[spaceKey]?.preferences.isEnabled = false
        controllers[spaceKey]?.hide()
    }

    func toggleCurrentSpaceCollapsed() {
        refreshCurrentSpace()
        guard let state = currentSpaceState else { return }
        toggleCollapsed(spaceKey: state.id)
    }

    func toggleCollapsed(spaceKey: String) {
        controllers[spaceKey]?.toggleCollapsed()
    }

    func resetCurrentSpaceLayout() {
        refreshCurrentSpace()
        guard let state = currentSpaceState else { return }
        resetLayout(spaceKey: state.id)
    }

    func resetLayout(spaceKey: String) {
        guard let state = statesByKey[spaceKey] else { return }
        state.preferences.resetLayout()
        state.issueFilterState.syncRepoSelection(repos: store.repos)
        state.pullRequestFilterState.syncRepoSelection(repos: store.repos)
        state.sessionFilterState.syncRepoSelection(repoKeys: MacSessionListProjection.repoKeys(for: store.sessions))
        controllers[spaceKey]?.applyPreferencesLayout()
    }

    func resetAllLayouts() {
        for state in spaceStates {
            resetLayout(spaceKey: state.id)
        }
        preferences.resetLayout()
    }

    func showCurrentSpace() {
        refreshCurrentSpace()
        guard let state = currentSpaceState else { return }
        state.preferences.isEnabled = true
        controllers[state.id]?.show()
    }

    func hideCurrentSpace() {
        refreshCurrentSpace()
        guard let state = currentSpaceState else { return }
        state.preferences.isEnabled = false
        controllers[state.id]?.hide()
    }

    var currentSpaceState: MacSidebarSpaceState? {
        guard let currentSpaceKey else { return nil }
        return statesByKey[currentSpaceKey]
    }

    private func stateForActiveSpace() -> MacSidebarSpaceState? {
        spaceStates.first { state in
            state.anchorWindow.isVisibleOnActiveSpace
        } ?? spaceStates.first { state in
            controllers[state.id]?.isOnActiveSpace == true
        }
    }

    private func hideInactivePanels(activeSpaceKey: String) {
        for (spaceKey, controller) in controllers where spaceKey != activeSpaceKey {
            controller.hide()
        }
    }

    private func createStateForActiveSpace() -> MacSidebarSpaceState {
        let slot = nextSlot()
        let key = MacSidebarSpaceState.key(forSlot: slot)
        let state = MacSidebarSpaceState(
            slot: slot,
            preferences: preferences.spacePreferences(for: key)
        )
        statesByKey[key] = state
        spaceStates.append(state)
        spaceStates.sort { $0.slot < $1.slot }
        return state
    }

    private func nextSlot() -> Int {
        var slot = 1
        let existingSlots = Set(spaceStates.map(\.slot))
        while existingSlots.contains(slot) {
            slot += 1
        }
        return slot
    }

    private func realignActiveSpacePanel() {
        guard let state = currentSpaceState else { return }
        controllers[state.id]?.updateScreen(activeScreen())
    }

    private func makePanelController(for state: MacSidebarSpaceState) -> SidebarPanelController {
        let spaceKey = state.id
        let rootView = MacSidebarRootView(
            store: store,
            issueFilterState: state.issueFilterState,
            pullRequestFilterState: state.pullRequestFilterState,
            sessionFilterState: state.sessionFilterState
        )
            .environment(apiClient)
            .environment(offlineSync)
            .environment(networkMonitor)
            .environment(state.chrome)
            .environment(preferences)
            .environment(state.preferences)
            .environment(\.hideSidebar) { [weak self] in
                self?.hide(spaceKey: spaceKey)
            }
            .environment(\.toggleSidebarCollapsed) { [weak self] in
                self?.toggleCollapsed(spaceKey: spaceKey)
            }
            .environment(\.resetSidebarLayout) { [weak self] in
                self?.resetLayout(spaceKey: spaceKey)
            }

        return SidebarPanelController(
            rootView: rootView,
            stateKey: spaceKey,
            screen: activeScreen(),
            chrome: state.chrome,
            preferences: state.preferences,
            followsActiveSpace: false
        )
    }

    private func activeScreen() -> NSScreen {
        NSScreen.main ?? NSScreen.screens[0]
    }
}
