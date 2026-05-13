import CoreGraphics
import Foundation
import ServiceManagement

@Observable @MainActor
final class MacSidebarPreferences {
    private enum Keys {
        static let isCollapsed = "mac.sidebar.isCollapsed"
        static let selectedSection = "mac.sidebar.selectedSection"
        static let expandedWidth = "mac.sidebar.expandedWidth"
        static let textScale = "mac.sidebar.textScale"
    }

    private let defaults: UserDefaults

    var isCollapsed: Bool {
        didSet { defaults.set(isCollapsed, forKey: Keys.isCollapsed) }
    }

    var selectedSectionRawValue: String {
        didSet { defaults.set(selectedSectionRawValue, forKey: Keys.selectedSection) }
    }

    var expandedWidth: CGFloat {
        didSet { defaults.set(Double(expandedWidth), forKey: Keys.expandedWidth) }
    }

    var textScale: Double {
        didSet { defaults.set(textScale, forKey: Keys.textScale) }
    }

    var launchAtLogin = false
    var launchAtLoginError: String?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        isCollapsed = defaults.object(forKey: Keys.isCollapsed) as? Bool ?? false
        selectedSectionRawValue = defaults.string(forKey: Keys.selectedSection) ?? "issues"
        expandedWidth = Self.clampedWidth(defaults.object(forKey: Keys.expandedWidth) as? Double ?? 380)
        textScale = Self.clampedTextScale(defaults.object(forKey: Keys.textScale) as? Double ?? Self.defaultTextScale)
        refreshLaunchAtLoginStatus()
    }

    func refreshLaunchAtLoginStatus() {
        launchAtLogin = SMAppService.mainApp.status == .enabled
    }

    func setLaunchAtLogin(_ enabled: Bool) async {
        launchAtLoginError = nil

        do {
            if enabled {
                if SMAppService.mainApp.status != .enabled {
                    try SMAppService.mainApp.register()
                }
            } else if SMAppService.mainApp.status == .enabled {
                try await SMAppService.mainApp.unregister()
            }
        } catch {
            launchAtLoginError = error.localizedDescription
        }

        refreshLaunchAtLoginStatus()
    }

    func resetLayout() {
        isCollapsed = false
        selectedSectionRawValue = "issues"
        expandedWidth = Self.defaultExpandedWidth
        textScale = Self.defaultTextScale
    }

    nonisolated static let defaultExpandedWidth: CGFloat = 380
    nonisolated static let minimumExpandedWidth: CGFloat = 340
    nonisolated static let maximumExpandedWidth: CGFloat = 560
    nonisolated static let defaultTextScale = 1.1
    nonisolated static let minimumTextScale = 0.95
    nonisolated static let maximumTextScale = 1.35

    nonisolated static func clampedWidth(_ width: CGFloat) -> CGFloat {
        min(max(width, minimumExpandedWidth), maximumExpandedWidth)
    }

    nonisolated static func clampedWidth(_ width: Double) -> CGFloat {
        clampedWidth(CGFloat(width))
    }

    nonisolated static func clampedTextScale(_ scale: Double) -> Double {
        min(max(scale, minimumTextScale), maximumTextScale)
    }
}
