import AppKit
import SwiftUI

@main
struct IssueCTLMacApp: App {
    @NSApplicationDelegateAdaptor(MacAppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            MacSettingsView()
                .environment(appDelegate.apiClient)
        }
    }
}

@MainActor
final class MacAppDelegate: NSObject, NSApplicationDelegate {
    let apiClient = APIClient()
    private let networkMonitor = NetworkMonitor()
    private let sidebarChrome = SidebarChromeState()
    private var panelController: SidebarPanelController?
    private var statusItem: NSStatusItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        PerformanceTrace.markAppLaunchStarted()
        NSApp.setActivationPolicy(.accessory)

        let rootView = MacSidebarRootView()
            .environment(apiClient)
            .environment(networkMonitor)
            .environment(sidebarChrome)
            .environment(\.hideSidebar) { [weak self] in
                self?.panelController?.hide()
            }
            .environment(\.toggleSidebarCollapsed) { [weak self] in
                self?.panelController?.toggleCollapsed()
            }

        let panelController = SidebarPanelController(rootView: rootView, chrome: sidebarChrome)
        self.panelController = panelController
        panelController.show()

        configureStatusItem()
    }

    private func configureStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.image = NSImage(systemSymbolName: "list.bullet.rectangle", accessibilityDescription: "IssueCTL")
        item.button?.imagePosition = .imageOnly

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Toggle Sidebar", action: #selector(toggleSidebar), keyEquivalent: "s"))
        menu.addItem(NSMenuItem(title: "Collapse or Expand", action: #selector(toggleCollapsed), keyEquivalent: "m"))
        menu.addItem(NSMenuItem(title: "Hide Sidebar", action: #selector(hideSidebar), keyEquivalent: "w"))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit IssueCTL", action: #selector(quit), keyEquivalent: "q"))
        menu.items.forEach { $0.target = self }
        item.menu = menu

        statusItem = item
    }

    @objc private func toggleSidebar() {
        panelController?.toggleVisibility()
    }

    @objc private func toggleCollapsed() {
        panelController?.toggleCollapsed()
    }

    @objc private func hideSidebar() {
        panelController?.hide()
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}
