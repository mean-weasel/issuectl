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
    lazy var sidebarCoordinator = DisplaySidebarCoordinator(
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
        sidebarCoordinator.start()
        configureStatusItem()
    }

    private func configureStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.image = NSImage(systemSymbolName: "list.bullet.rectangle", accessibilityDescription: "IssueCTL")
        item.button?.imagePosition = .imageOnly
        item.button?.toolTip = "IssueCTL"

        let menu = NSMenu()
        menu.delegate = self
        menu.addItem(NSMenuItem(title: "Show All Sidebars", action: #selector(showAllSidebars), keyEquivalent: "s"))
        menu.addItem(NSMenuItem(title: "Hide All Sidebars", action: #selector(hideAllSidebars), keyEquivalent: "w"))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Settings...", action: #selector(openSettings), keyEquivalent: ","))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit IssueCTL", action: #selector(quit), keyEquivalent: "q"))
        menu.items.forEach { $0.target = self }
        item.menu = menu

        statusItem = item
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        menu.addItem(NSMenuItem(title: "Show All Sidebars", action: #selector(showAllSidebars), keyEquivalent: "s"))
        menu.addItem(NSMenuItem(title: "Hide All Sidebars", action: #selector(hideAllSidebars), keyEquivalent: "w"))
        menu.addItem(.separator())

        for state in sidebarCoordinator.displayStates {
            let displayMenu = NSMenu()
            displayMenu.addItem(NSMenuItem(
                title: state.chrome.isVisible ? "Hide Sidebar" : "Show Sidebar",
                action: #selector(toggleDisplayVisibility(_:)),
                keyEquivalent: ""
            ))
            displayMenu.addItem(NSMenuItem(
                title: state.chrome.isCollapsed ? "Expand Sidebar" : "Collapse Sidebar",
                action: #selector(toggleDisplayCollapsed(_:)),
                keyEquivalent: ""
            ))
            displayMenu.addItem(NSMenuItem(title: "Reset Layout", action: #selector(resetDisplayLayout(_:)), keyEquivalent: ""))
            displayMenu.items.forEach {
                $0.target = self
                $0.representedObject = state.id
            }

            let item = NSMenuItem(title: state.descriptor.name, action: nil, keyEquivalent: "")
            item.submenu = displayMenu
            menu.addItem(item)
        }

        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Reset All Sidebar Layouts", action: #selector(resetAllSidebarLayouts), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Settings...", action: #selector(openSettings), keyEquivalent: ","))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit IssueCTL", action: #selector(quit), keyEquivalent: "q"))
        menu.items.forEach { $0.target = self }
    }

    @objc private func showAllSidebars() {
        sidebarCoordinator.showAll()
    }

    @objc private func hideAllSidebars() {
        sidebarCoordinator.hideAll()
    }

    @objc private func toggleDisplayVisibility(_ sender: NSMenuItem) {
        guard let displayKey = sender.representedObject as? String else { return }
        sidebarCoordinator.toggleVisibility(displayKey: displayKey)
    }

    @objc private func toggleDisplayCollapsed(_ sender: NSMenuItem) {
        guard let displayKey = sender.representedObject as? String else { return }
        sidebarCoordinator.toggleCollapsed(displayKey: displayKey)
    }

    @objc private func resetDisplayLayout(_ sender: NSMenuItem) {
        guard let displayKey = sender.representedObject as? String else { return }
        sidebarCoordinator.resetLayout(displayKey: displayKey)
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
        let window = NSWindow(contentViewController: hostingController)
        window.title = "IssueCTL Settings"
        window.styleMask = [.titled, .closable, .miniaturizable]
        window.isReleasedWhenClosed = false
        window.center()
        return NSWindowController(window: window)
    }
}

extension MacAppDelegate: NSMenuDelegate {}
