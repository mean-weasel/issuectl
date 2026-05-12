import AppKit
import SwiftUI

private struct HideSidebarKey: EnvironmentKey {
    static let defaultValue: @MainActor () -> Void = {}
}

private struct ToggleSidebarCollapsedKey: EnvironmentKey {
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
}

@Observable @MainActor
final class SidebarChromeState {
    var isCollapsed = false
    var isVisible = false
}

@MainActor
final class SidebarPanelController {
    private enum Metrics {
        static let collapsedWidth: CGFloat = 76
        static let expandedMinWidth: CGFloat = 340
        static let expandedMaxWidth: CGFloat = 560
        static let defaultExpandedWidth: CGFloat = 380
        static let horizontalInset: CGFloat = 12
        static let verticalInset: CGFloat = 12
        static let minimumHeight: CGFloat = 480
    }

    private let panel: NSPanel
    private let chrome: SidebarChromeState
    private var expandedWidth = Metrics.defaultExpandedWidth

    init<Content: View>(rootView: Content, chrome: SidebarChromeState) {
        self.chrome = chrome
        let hostingController = NSHostingController(rootView: rootView)
        let frame = Self.defaultFrame()

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
        panel.minSize = NSSize(width: Metrics.expandedMinWidth, height: Metrics.minimumHeight)
        panel.maxSize = NSSize(width: Metrics.expandedMaxWidth, height: CGFloat.greatestFiniteMagnitude)
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

        if isCollapsed {
            expandedWidth = min(max(panel.frame.width, Metrics.expandedMinWidth), Metrics.expandedMaxWidth)
            panel.minSize = NSSize(width: Metrics.collapsedWidth, height: Metrics.minimumHeight)
            panel.maxSize = NSSize(width: Metrics.collapsedWidth, height: CGFloat.greatestFiniteMagnitude)
        } else {
            panel.minSize = NSSize(width: Metrics.expandedMinWidth, height: Metrics.minimumHeight)
            panel.maxSize = NSSize(width: Metrics.expandedMaxWidth, height: CGFloat.greatestFiniteMagnitude)
        }

        chrome.isCollapsed = isCollapsed
        panel.setFrame(Self.defaultFrame(width: currentWidth), display: true, animate: true)
        if !panel.isVisible {
            show()
        }
    }

    private var currentWidth: CGFloat {
        if chrome.isCollapsed {
            return Metrics.collapsedWidth
        }
        return min(max(expandedWidth, Metrics.expandedMinWidth), Metrics.expandedMaxWidth)
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
