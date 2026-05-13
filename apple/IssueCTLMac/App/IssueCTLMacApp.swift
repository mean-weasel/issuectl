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
                .environment(appDelegate.sidebarChrome)
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
    let sidebarChrome = SidebarChromeState()
    private let networkMonitor = NetworkMonitor()
    private var panelController: SidebarPanelController?
    private var statusItem: NSStatusItem?
    private var collapseMenuItem: NSMenuItem?
    private var settingsWindowController: NSWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        PerformanceTrace.markAppLaunchStarted()
        NSApp.setActivationPolicy(.accessory)
        sidebarChrome.isCollapsed = sidebarPreferences.isCollapsed

        let rootView = MacSidebarRootView()
            .environment(apiClient)
            .environment(networkMonitor)
            .environment(sidebarChrome)
            .environment(sidebarPreferences)
            .environment(\.hideSidebar) { [weak self] in
                self?.panelController?.hide()
                self?.updateStatusMenuTitles()
            }
            .environment(\.toggleSidebarCollapsed) { [weak self] in
                self?.panelController?.toggleCollapsed()
                self?.updateStatusMenuTitles()
            }
            .environment(\.resetSidebarLayout) { [weak self] in
                self?.resetSidebarLayout()
            }

        let panelController = SidebarPanelController(
            rootView: rootView,
            chrome: sidebarChrome,
            preferences: sidebarPreferences
        )
        self.panelController = panelController
        panelController.show()

        configureStatusItem()
    }

    private func configureStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.image = NSImage(systemSymbolName: "list.bullet.rectangle", accessibilityDescription: "IssueCTL")
        item.button?.imagePosition = .imageOnly
        item.button?.toolTip = "IssueCTL"

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Toggle Sidebar", action: #selector(toggleSidebar), keyEquivalent: "s"))
        let collapseItem = NSMenuItem(title: collapsedMenuTitle, action: #selector(toggleCollapsed), keyEquivalent: "m")
        collapseMenuItem = collapseItem
        menu.addItem(collapseItem)
        menu.addItem(NSMenuItem(title: "Hide Sidebar", action: #selector(hideSidebar), keyEquivalent: "w"))
        menu.addItem(NSMenuItem(title: "Settings...", action: #selector(openSettings), keyEquivalent: ","))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit IssueCTL", action: #selector(quit), keyEquivalent: "q"))
        menu.items.forEach { $0.target = self }
        item.menu = menu

        statusItem = item
    }

    @objc private func toggleSidebar() {
        panelController?.toggleVisibility()
        updateStatusMenuTitles()
    }

    @objc private func toggleCollapsed() {
        panelController?.toggleCollapsed()
        updateStatusMenuTitles()
    }

    @objc private func hideSidebar() {
        panelController?.hide()
        updateStatusMenuTitles()
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
        sidebarPreferences.resetLayout()
        panelController?.applyPreferencesLayout()
        updateStatusMenuTitles()
    }

    private var collapsedMenuTitle: String {
        sidebarChrome.isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"
    }

    private func updateStatusMenuTitles() {
        collapseMenuItem?.title = collapsedMenuTitle
    }

    private func makeSettingsWindowController() -> NSWindowController {
        let settingsView = MacSettingsView()
            .environment(apiClient)
            .environment(sidebarPreferences)
            .environment(sidebarChrome)
            .environment(\.resetSidebarLayout) { [weak self] in
                self?.resetSidebarLayout()
            }
        let hostingController = NSHostingController(rootView: settingsView)
        let window = NSWindow(contentViewController: hostingController)
        window.title = "IssueCTL Settings"
        window.styleMask = [.titled, .closable, .miniaturizable]
        window.isReleasedWhenClosed = false
        window.center()
        return NSWindowController(window: window)
    }
}
