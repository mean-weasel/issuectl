import AppKit
import SwiftUI

@Observable @MainActor
final class MacSidebarDisplayState {
    var descriptor: MacSidebarDisplayDescriptor
    let preferences: MacSidebarDisplayPreferences
    let chrome: SidebarChromeState
    let issueFilterState: MacIssueFilterState

    var id: String { descriptor.key }

    init(descriptor: MacSidebarDisplayDescriptor, preferences: MacSidebarDisplayPreferences) {
        self.descriptor = descriptor
        self.preferences = preferences
        chrome = SidebarChromeState()
        chrome.isCollapsed = preferences.isCollapsed
        issueFilterState = MacIssueFilterState(preferences: preferences)
    }
}

@Observable @MainActor
final class DisplaySidebarCoordinator {
    let apiClient: APIClient
    let preferences: MacSidebarPreferences
    let networkMonitor: NetworkMonitor
    let store: MacSidebarStore

    private let displayProvider: MacSidebarDisplayProviding
    private var controllers: [String: SidebarPanelController] = [:]
    private var displayStatesByKey: [String: MacSidebarDisplayState] = [:]
    private var screenObserver: NSObjectProtocol?
    private(set) var displayStates: [MacSidebarDisplayState] = []

    init(
        apiClient: APIClient,
        preferences: MacSidebarPreferences,
        networkMonitor: NetworkMonitor,
        store: MacSidebarStore = MacSidebarStore(),
        displayProvider: MacSidebarDisplayProviding = NSScreenSidebarDisplayProvider()
    ) {
        self.apiClient = apiClient
        self.preferences = preferences
        self.networkMonitor = networkMonitor
        self.store = store
        self.displayProvider = displayProvider
    }

    func start() {
        refreshDisplays(showNewPanels: true)
        screenObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.refreshDisplays(showNewPanels: true)
            }
        }
    }

    func stop() {
        if let screenObserver {
            NotificationCenter.default.removeObserver(screenObserver)
        }
        screenObserver = nil
        controllers.values.forEach { $0.hide() }
        controllers.removeAll()
        displayStates.removeAll()
        displayStatesByKey.removeAll()
    }

    func refreshDisplays(showNewPanels: Bool) {
        let descriptors = displayProvider.currentDisplays()
        let activeKeys = Set(descriptors.map(\.key))

        for (key, controller) in controllers where !activeKeys.contains(key) {
            controller.hide()
        }
        controllers = controllers.filter { activeKeys.contains($0.key) }

        var nextStates: [MacSidebarDisplayState] = []
        for descriptor in descriptors {
            let state = displayStatesByKey[descriptor.key] ?? makeState(for: descriptor)
            state.descriptor = descriptor
            displayStatesByKey[descriptor.key] = state
            nextStates.append(state)

            if let controller = controllers[descriptor.key] {
                controller.updateScreen(descriptor.screen)
            } else {
                let controller = makePanelController(for: state)
                controllers[descriptor.key] = controller
                if showNewPanels, state.preferences.isEnabled {
                    controller.show()
                }
            }
        }

        displayStates = nextStates.sorted { lhs, rhs in
            if lhs.descriptor.isMain != rhs.descriptor.isMain {
                return lhs.descriptor.isMain
            }
            return lhs.descriptor.name < rhs.descriptor.name
        }
    }

    func toggleVisibility(displayKey: String) {
        controllers[displayKey]?.toggleVisibility()
    }

    func hide(displayKey: String) {
        controllers[displayKey]?.hide()
    }

    func toggleCollapsed(displayKey: String) {
        controllers[displayKey]?.toggleCollapsed()
    }

    func resetLayout(displayKey: String) {
        guard let state = displayStatesByKey[displayKey] else { return }
        state.preferences.resetLayout()
        state.issueFilterState.syncRepoSelection(repos: store.repos)
        controllers[displayKey]?.applyPreferencesLayout()
    }

    func resetAllLayouts() {
        for state in displayStates {
            resetLayout(displayKey: state.id)
        }
        preferences.resetLayout()
    }

    func showAll() {
        for state in displayStates where state.preferences.isEnabled {
            controllers[state.id]?.show()
        }
    }

    func hideAll() {
        controllers.values.forEach { $0.hide() }
    }

    private func makeState(for descriptor: MacSidebarDisplayDescriptor) -> MacSidebarDisplayState {
        MacSidebarDisplayState(
            descriptor: descriptor,
            preferences: preferences.displayPreferences(for: descriptor.key)
        )
    }

    private func makePanelController(for state: MacSidebarDisplayState) -> SidebarPanelController {
        let displayKey = state.id
        let rootView = MacSidebarRootView(store: store, issueFilterState: state.issueFilterState)
            .environment(apiClient)
            .environment(networkMonitor)
            .environment(state.chrome)
            .environment(preferences)
            .environment(state.preferences)
            .environment(\.hideSidebar) { [weak self] in
                self?.hide(displayKey: displayKey)
            }
            .environment(\.toggleSidebarCollapsed) { [weak self] in
                self?.toggleCollapsed(displayKey: displayKey)
            }
            .environment(\.resetSidebarLayout) { [weak self] in
                self?.resetLayout(displayKey: displayKey)
            }

        return SidebarPanelController(
            rootView: rootView,
            displayKey: displayKey,
            screen: state.descriptor.screen,
            chrome: state.chrome,
            preferences: state.preferences
        )
    }
}
