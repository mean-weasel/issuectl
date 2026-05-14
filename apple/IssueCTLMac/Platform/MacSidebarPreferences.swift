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

    var textScale: Double {
        didSet { defaults.set(textScale, forKey: Keys.textScale) }
    }

    var launchAtLogin = false
    var launchAtLoginError: String?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
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
        textScale = Self.defaultTextScale
    }

    func displayPreferences(for displayKey: String) -> MacSidebarDisplayPreferences {
        MacSidebarDisplayPreferences(displayKey: displayKey, defaults: defaults)
    }

    func spacePreferences(for spaceKey: String) -> MacSidebarDisplayPreferences {
        MacSidebarDisplayPreferences(displayKey: spaceKey, defaults: defaults, namespace: "spaces")
    }

    func resetAllDisplayLayouts(displayKeys: [String]) {
        for displayKey in displayKeys {
            displayPreferences(for: displayKey).resetLayout()
        }
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

@Observable @MainActor
final class MacSidebarDisplayPreferences {
    private enum LegacyKeys {
        static let isCollapsed = "mac.sidebar.isCollapsed"
        static let selectedSection = "mac.sidebar.selectedSection"
        static let expandedWidth = "mac.sidebar.expandedWidth"
    }

    private let defaults: UserDefaults
    private let namespace: String
    let displayKey: String

    var isCollapsed: Bool {
        didSet { defaults.set(isCollapsed, forKey: key("isCollapsed")) }
    }

    var selectedSectionRawValue: String {
        didSet { defaults.set(selectedSectionRawValue, forKey: key("selectedSection")) }
    }

    var expandedWidth: CGFloat {
        didSet { defaults.set(Double(expandedWidth), forKey: key("expandedWidth")) }
    }

    var issueFilterRawValue: String {
        didSet { defaults.set(issueFilterRawValue, forKey: key("issueFilter")) }
    }

    var selectedRepoKeys: Set<String> {
        didSet { defaults.set(Array(selectedRepoKeys).sorted(), forKey: key("selectedRepoKeys")) }
    }

    var isRepoFilterExpanded: Bool {
        didSet { defaults.set(isRepoFilterExpanded, forKey: key("isRepoFilterExpanded")) }
    }

    var isEnabled: Bool {
        didSet { defaults.set(isEnabled, forKey: key("isEnabled")) }
    }

    var hasSavedRepoSelection: Bool {
        defaults.object(forKey: key("selectedRepoKeys")) != nil
    }

    init(displayKey: String, defaults: UserDefaults = .standard, namespace: String = "displays") {
        self.displayKey = displayKey
        self.defaults = defaults
        self.namespace = namespace
        isCollapsed = defaults.object(forKey: Self.storageKey(namespace: namespace, displayKey: displayKey, name: "isCollapsed")) as? Bool
            ?? defaults.object(forKey: LegacyKeys.isCollapsed) as? Bool
            ?? false
        selectedSectionRawValue = defaults.string(forKey: Self.storageKey(namespace: namespace, displayKey: displayKey, name: "selectedSection"))
            ?? defaults.string(forKey: LegacyKeys.selectedSection)
            ?? "issues"
        expandedWidth = MacSidebarPreferences.clampedWidth(
            defaults.object(forKey: Self.storageKey(namespace: namespace, displayKey: displayKey, name: "expandedWidth")) as? Double
                ?? defaults.object(forKey: LegacyKeys.expandedWidth) as? Double
                ?? MacSidebarPreferences.defaultExpandedWidth
        )
        issueFilterRawValue = defaults.string(forKey: Self.storageKey(namespace: namespace, displayKey: displayKey, name: "issueFilter")) ?? "open"
        selectedRepoKeys = Set(defaults.stringArray(forKey: Self.storageKey(namespace: namespace, displayKey: displayKey, name: "selectedRepoKeys")) ?? [])
        isRepoFilterExpanded = defaults.object(forKey: Self.storageKey(namespace: namespace, displayKey: displayKey, name: "isRepoFilterExpanded")) as? Bool ?? true
        isEnabled = defaults.object(forKey: Self.storageKey(namespace: namespace, displayKey: displayKey, name: "isEnabled")) as? Bool ?? true
    }

    func resetLayout() {
        isCollapsed = false
        selectedSectionRawValue = "issues"
        expandedWidth = MacSidebarPreferences.defaultExpandedWidth
        issueFilterRawValue = "open"
        selectedRepoKeys.removeAll()
        isRepoFilterExpanded = true
        isEnabled = true
    }

    private func key(_ name: String) -> String {
        Self.storageKey(namespace: namespace, displayKey: displayKey, name: name)
    }

    private static func storageKey(namespace: String, displayKey: String, name: String) -> String {
        "mac.sidebar.\(namespace).\(displayKey).\(name)"
    }
}
