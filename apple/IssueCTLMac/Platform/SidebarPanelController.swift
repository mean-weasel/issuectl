import AppKit
import SwiftUI

private struct HideSidebarKey: EnvironmentKey {
    static let defaultValue: @MainActor () -> Void = {}
}

extension EnvironmentValues {
    var hideSidebar: @MainActor () -> Void {
        get { self[HideSidebarKey.self] }
        set { self[HideSidebarKey.self] = newValue }
    }
}

@MainActor
final class SidebarPanelController {
    private let panel: NSPanel

    init<Content: View>(rootView: Content) {
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
        panel.minSize = NSSize(width: 340, height: 480)
        panel.maxSize = NSSize(width: 560, height: CGFloat.greatestFiniteMagnitude)
    }

    func show() {
        panel.setFrame(Self.defaultFrame(width: panel.frame.width), display: true)
        panel.orderFrontRegardless()
    }

    func hide() {
        panel.orderOut(nil)
    }

    private static func defaultFrame(width requestedWidth: CGFloat = 380) -> NSRect {
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let width = min(max(requestedWidth, 340), 560)
        return NSRect(
            x: screenFrame.maxX - width - 12,
            y: screenFrame.minY + 12,
            width: width,
            height: max(screenFrame.height - 24, 480)
        )
    }
}
