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
        anchorWindow = MacSidebarSpaceAnchorWindow(identifier: key)
    }

    static func key(forSlot slot: Int) -> String {
        "space-slot-\(slot)"
    }
}

@MainActor
final class MacSidebarSpaceAnchorWindow {
    private let window: NSPanel

    init(identifier: String) {
        let frame = NSRect(x: 1, y: 1, width: 1, height: 1)
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

    var isOnActiveSpace: Bool {
        window.isOnActiveSpace
    }

    func close() {
        window.close()
    }
}

@Observable @MainActor
final class SpaceSidebarCoordinator {
    let apiClient: APIClient
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
        preferences: MacSidebarPreferences,
        networkMonitor: NetworkMonitor,
        store: MacSidebarStore = MacSidebarStore()
    ) {
        self.apiClient = apiClient
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
            if showNewPanel, state.preferences.isEnabled {
                controller.show()
            }
        } else {
            realignActiveSpacePanel()
        }
    }

    func toggleCurrentSpaceVisibility() {
        guard let state = currentSpaceState else { return }
        toggleVisibility(spaceKey: state.id)
    }

    func toggleVisibility(spaceKey: String) {
        controllers[spaceKey]?.toggleVisibility()
    }

    func hide(spaceKey: String) {
        controllers[spaceKey]?.hide()
    }

    func toggleCurrentSpaceCollapsed() {
        guard let state = currentSpaceState else { return }
        toggleCollapsed(spaceKey: state.id)
    }

    func toggleCollapsed(spaceKey: String) {
        controllers[spaceKey]?.toggleCollapsed()
    }

    func resetCurrentSpaceLayout() {
        guard let state = currentSpaceState else { return }
        resetLayout(spaceKey: state.id)
    }

    func resetLayout(spaceKey: String) {
        guard let state = statesByKey[spaceKey] else { return }
        state.preferences.resetLayout()
        state.issueFilterState.syncRepoSelection(repos: store.repos)
        controllers[spaceKey]?.applyPreferencesLayout()
    }

    func resetAllLayouts() {
        for state in spaceStates {
            resetLayout(spaceKey: state.id)
        }
        preferences.resetLayout()
    }

    func showCurrentSpace() {
        guard let state = currentSpaceState else { return }
        controllers[state.id]?.show()
    }

    func hideCurrentSpace() {
        guard let state = currentSpaceState else { return }
        controllers[state.id]?.hide()
    }

    var currentSpaceState: MacSidebarSpaceState? {
        guard let currentSpaceKey else { return nil }
        return statesByKey[currentSpaceKey]
    }

    private func stateForActiveSpace() -> MacSidebarSpaceState? {
        spaceStates.first { state in
            state.anchorWindow.isOnActiveSpace || controllers[state.id]?.isOnActiveSpace == true
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
        let rootView = MacSidebarRootView(store: store, issueFilterState: state.issueFilterState)
            .environment(apiClient)
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
