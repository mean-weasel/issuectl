import AppKit
import SwiftUI

private struct HideSidebarKey: EnvironmentKey {
    static let defaultValue: @MainActor () -> Void = {}
}

private struct ToggleSidebarCollapsedKey: EnvironmentKey {
    static let defaultValue: @MainActor () -> Void = {}
}

private struct ResetSidebarLayoutKey: EnvironmentKey {
    static let defaultValue: @MainActor () -> Void = {}
}

extension EnvironmentValues {
    var hideSidebar: @MainActor () -> Void {
        get { self[HideSidebarKey.self] }
        set { self[HideSidebarKey.self] = newValue }
    }

    var toggleSidebarCollapsed: @MainActor () -> Void {
        get { self[ToggleSidebarCollapsedKey.self] }
        set { self[ToggleSidebarCollapsedKey.self] = newValue }
    }

    var resetSidebarLayout: @MainActor () -> Void {
        get { self[ResetSidebarLayoutKey.self] }
        set { self[ResetSidebarLayoutKey.self] = newValue }
    }
}

@Observable @MainActor
final class SidebarChromeState {
    var isCollapsed = false
    var isVisible = false
}

@MainActor
final class SidebarPanelController: NSObject, NSWindowDelegate {
    private enum Metrics {
        static let collapsedWidth: CGFloat = 76
        static let expandedMinWidth = MacSidebarPreferences.minimumExpandedWidth
        static let expandedMaxWidth = MacSidebarPreferences.maximumExpandedWidth
        static let defaultExpandedWidth = MacSidebarPreferences.defaultExpandedWidth
        static let horizontalInset: CGFloat = 12
        static let verticalInset: CGFloat = 12
        static let minimumHeight: CGFloat = 480
    }

    private var panel: NSPanel!
    private let chrome: SidebarChromeState
    private let preferences: MacSidebarPreferences
    private var expandedWidth: CGFloat

    init<Content: View>(
        rootView: Content,
        chrome: SidebarChromeState,
        preferences: MacSidebarPreferences
    ) {
        self.chrome = chrome
        self.preferences = preferences
        expandedWidth = MacSidebarPreferences.clampedWidth(preferences.expandedWidth)

        super.init()

        let hostingController = NSHostingController(rootView: rootView)
        chrome.isCollapsed = preferences.isCollapsed
        let frame = Self.defaultFrame(width: preferences.isCollapsed ? Metrics.collapsedWidth : expandedWidth)

        panel = NSPanel(
            contentRect: frame,
            styleMask: [.nonactivatingPanel, .titled, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.contentViewController = hostingController
        panel.title = "IssueCTL"
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
        panel.delegate = self
        updateSizeConstraints()
    }

    func show() {
        panel.setFrame(Self.defaultFrame(width: currentWidth), display: true)
        panel.orderFrontRegardless()
        chrome.isVisible = true
    }

    func hide() {
        panel.orderOut(nil)
        chrome.isVisible = false
    }

    func toggleVisibility() {
        if panel.isVisible {
            hide()
        } else {
            show()
        }
    }

    func toggleCollapsed() {
        setCollapsed(!chrome.isCollapsed)
    }

    func setCollapsed(_ isCollapsed: Bool) {
        guard chrome.isCollapsed != isCollapsed else { return }

        if isCollapsed, panel.frame.width != Metrics.collapsedWidth {
            saveExpandedWidth(panel.frame.width)
        }

        chrome.isCollapsed = isCollapsed
        preferences.isCollapsed = isCollapsed
        updateSizeConstraints()
        panel.setFrame(Self.defaultFrame(width: currentWidth), display: true, animate: true)
        if !panel.isVisible {
            show()
        }
    }

    func applyPreferencesLayout() {
        expandedWidth = MacSidebarPreferences.clampedWidth(preferences.expandedWidth)
        chrome.isCollapsed = preferences.isCollapsed
        updateSizeConstraints()
        panel.setFrame(Self.defaultFrame(width: currentWidth), display: true, animate: true)
        if !panel.isVisible {
            show()
        }
    }

    func windowDidResize(_ notification: Notification) {
        guard !chrome.isCollapsed else { return }
        saveExpandedWidth(panel.frame.width)
    }

    private var currentWidth: CGFloat {
        if chrome.isCollapsed {
            return Metrics.collapsedWidth
        }
        return MacSidebarPreferences.clampedWidth(expandedWidth)
    }

    private func updateSizeConstraints() {
        if chrome.isCollapsed {
            panel.minSize = NSSize(width: Metrics.collapsedWidth, height: Metrics.minimumHeight)
            panel.maxSize = NSSize(width: Metrics.collapsedWidth, height: CGFloat.greatestFiniteMagnitude)
        } else {
            panel.minSize = NSSize(width: Metrics.expandedMinWidth, height: Metrics.minimumHeight)
            panel.maxSize = NSSize(width: Metrics.expandedMaxWidth, height: CGFloat.greatestFiniteMagnitude)
        }
    }

    private func saveExpandedWidth(_ width: CGFloat) {
        expandedWidth = MacSidebarPreferences.clampedWidth(width)
        preferences.expandedWidth = expandedWidth
    }

    private static func defaultFrame(width requestedWidth: CGFloat = Metrics.defaultExpandedWidth) -> NSRect {
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let width = requestedWidth == Metrics.collapsedWidth
            ? Metrics.collapsedWidth
            : min(max(requestedWidth, Metrics.expandedMinWidth), Metrics.expandedMaxWidth)
        return NSRect(
            x: screenFrame.maxX - width - Metrics.horizontalInset,
            y: screenFrame.minY + Metrics.verticalInset,
            width: width,
            height: max(screenFrame.height - (Metrics.verticalInset * 2), Metrics.minimumHeight)
        )
    }
}
