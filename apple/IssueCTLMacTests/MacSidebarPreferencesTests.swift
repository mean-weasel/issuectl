import XCTest
@testable import IssueCTLMac

@MainActor
final class MacSidebarPreferencesTests: XCTestCase {
    private var suiteName: String!
    private var defaults: UserDefaults!

    override func setUpWithError() throws {
        try super.setUpWithError()
        suiteName = "issuectl.tests.mac-sidebar.\(UUID().uuidString)"
        defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDownWithError() throws {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        try super.tearDownWithError()
    }

    func testDefaultsUseExpandedIssueSidebar() {
        let preferences = MacSidebarPreferences(defaults: defaults)
        let display = preferences.displayPreferences(for: "display-a")

        XCTAssertFalse(display.isCollapsed)
        XCTAssertEqual(display.selectedSectionRawValue, "issues")
        XCTAssertEqual(display.expandedWidth, MacSidebarPreferences.defaultExpandedWidth)
        XCTAssertEqual(preferences.textScale, MacSidebarPreferences.defaultTextScale)
    }

    func testPersistsCollapsedSelectedSectionAndExpandedWidth() {
        let preferences = MacSidebarPreferences(defaults: defaults)
        let display = preferences.displayPreferences(for: "display-a")

        display.isCollapsed = true
        display.selectedSectionRawValue = "drafts"
        display.expandedWidth = 440
        display.issueFilterRawValue = "unassigned"
        display.selectedRepoKeys = ["mean-weasel/issuectl"]
        display.isRepoFilterExpanded = false
        preferences.textScale = 1.25

        let reloaded = MacSidebarPreferences(defaults: defaults)
        let reloadedDisplay = reloaded.displayPreferences(for: "display-a")
        XCTAssertTrue(reloadedDisplay.isCollapsed)
        XCTAssertEqual(reloadedDisplay.selectedSectionRawValue, "drafts")
        XCTAssertEqual(reloadedDisplay.expandedWidth, 440)
        XCTAssertEqual(reloadedDisplay.issueFilterRawValue, "unassigned")
        XCTAssertEqual(reloadedDisplay.selectedRepoKeys, ["mean-weasel/issuectl"])
        XCTAssertFalse(reloadedDisplay.isRepoFilterExpanded)
        XCTAssertEqual(reloaded.textScale, 1.25)
    }

    func testLoadsExpandedWidthClampedToSupportedRange() {
        defaults.set(120, forKey: "mac.sidebar.displays.display-a.expandedWidth")
        XCTAssertEqual(
            MacSidebarPreferences(defaults: defaults).displayPreferences(for: "display-a").expandedWidth,
            MacSidebarPreferences.minimumExpandedWidth
        )

        defaults.set(1_200, forKey: "mac.sidebar.displays.display-a.expandedWidth")
        XCTAssertEqual(
            MacSidebarPreferences(defaults: defaults).displayPreferences(for: "display-a").expandedWidth,
            MacSidebarPreferences.maximumExpandedWidth
        )
    }

    func testLoadsTextScaleClampedToSupportedRange() {
        defaults.set(0.5, forKey: "mac.sidebar.textScale")
        XCTAssertEqual(
            MacSidebarPreferences(defaults: defaults).textScale,
            MacSidebarPreferences.minimumTextScale
        )

        defaults.set(2.0, forKey: "mac.sidebar.textScale")
        XCTAssertEqual(
            MacSidebarPreferences(defaults: defaults).textScale,
            MacSidebarPreferences.maximumTextScale
        )
    }

    func testResetLayoutRestoresAndPersistsDefaults() {
        let preferences = MacSidebarPreferences(defaults: defaults)
        let display = preferences.displayPreferences(for: "display-a")
        display.isCollapsed = true
        display.selectedSectionRawValue = "settings"
        display.expandedWidth = 520
        display.issueFilterRawValue = "all"
        display.selectedRepoKeys = ["mean-weasel/issuectl"]
        display.isRepoFilterExpanded = false
        preferences.textScale = 1.3

        display.resetLayout()
        preferences.resetLayout()

        XCTAssertFalse(display.isCollapsed)
        XCTAssertEqual(display.selectedSectionRawValue, "issues")
        XCTAssertEqual(display.expandedWidth, MacSidebarPreferences.defaultExpandedWidth)
        XCTAssertEqual(display.issueFilterRawValue, "open")
        XCTAssertTrue(display.selectedRepoKeys.isEmpty)
        XCTAssertTrue(display.isRepoFilterExpanded)
        XCTAssertEqual(preferences.textScale, MacSidebarPreferences.defaultTextScale)

        let reloaded = MacSidebarPreferences(defaults: defaults)
        let reloadedDisplay = reloaded.displayPreferences(for: "display-a")
        XCTAssertFalse(reloadedDisplay.isCollapsed)
        XCTAssertEqual(reloadedDisplay.selectedSectionRawValue, "issues")
        XCTAssertEqual(reloadedDisplay.expandedWidth, MacSidebarPreferences.defaultExpandedWidth)
        XCTAssertEqual(reloaded.textScale, MacSidebarPreferences.defaultTextScale)
    }

    func testPerDisplayPreferencesDoNotCollide() {
        let preferences = MacSidebarPreferences(defaults: defaults)
        let displayA = preferences.displayPreferences(for: "display-a")
        let displayB = preferences.displayPreferences(for: "display-b")

        displayA.isCollapsed = true
        displayA.expandedWidth = 420
        displayA.selectedRepoKeys = ["mean-weasel/issuectl"]
        displayB.isCollapsed = false
        displayB.expandedWidth = 500
        displayB.selectedRepoKeys = ["mean-weasel/other"]

        let reloaded = MacSidebarPreferences(defaults: defaults)
        let reloadedA = reloaded.displayPreferences(for: "display-a")
        let reloadedB = reloaded.displayPreferences(for: "display-b")

        XCTAssertTrue(reloadedA.isCollapsed)
        XCTAssertFalse(reloadedB.isCollapsed)
        XCTAssertEqual(reloadedA.expandedWidth, 420)
        XCTAssertEqual(reloadedB.expandedWidth, 500)
        XCTAssertEqual(reloadedA.selectedRepoKeys, ["mean-weasel/issuectl"])
        XCTAssertEqual(reloadedB.selectedRepoKeys, ["mean-weasel/other"])
    }

    func testSpacePreferencesDoNotCollideWithDisplayPreferences() {
        let preferences = MacSidebarPreferences(defaults: defaults)
        let display = preferences.displayPreferences(for: "slot-a")
        let space = preferences.spacePreferences(for: "slot-a")

        display.isCollapsed = true
        display.selectedRepoKeys = ["mean-weasel/display"]
        space.isCollapsed = false
        space.selectedRepoKeys = ["mean-weasel/space"]

        let reloaded = MacSidebarPreferences(defaults: defaults)
        let reloadedDisplay = reloaded.displayPreferences(for: "slot-a")
        let reloadedSpace = reloaded.spacePreferences(for: "slot-a")

        XCTAssertTrue(reloadedDisplay.isCollapsed)
        XCTAssertFalse(reloadedSpace.isCollapsed)
        XCTAssertEqual(reloadedDisplay.selectedRepoKeys, ["mean-weasel/display"])
        XCTAssertEqual(reloadedSpace.selectedRepoKeys, ["mean-weasel/space"])
    }

    func testSpacePreferencesUseLegacyLayoutDefaultsForFirstRun() {
        defaults.set(true, forKey: "mac.sidebar.isCollapsed")
        defaults.set("active", forKey: "mac.sidebar.selectedSection")
        defaults.set(430, forKey: "mac.sidebar.expandedWidth")

        let space = MacSidebarPreferences(defaults: defaults).spacePreferences(for: "space-slot-1")

        XCTAssertTrue(space.isCollapsed)
        XCTAssertEqual(space.selectedSectionRawValue, "active")
        XCTAssertEqual(space.expandedWidth, 430)
    }

    func testDisplayPreferencesMigrateLegacyLayoutDefaults() {
        defaults.set(true, forKey: "mac.sidebar.isCollapsed")
        defaults.set("drafts", forKey: "mac.sidebar.selectedSection")
        defaults.set(455, forKey: "mac.sidebar.expandedWidth")

        let display = MacSidebarPreferences(defaults: defaults).displayPreferences(for: "display-a")

        XCTAssertTrue(display.isCollapsed)
        XCTAssertEqual(display.selectedSectionRawValue, "drafts")
        XCTAssertEqual(display.expandedWidth, 455)
    }

    func testClampedWidthEdgeValues() {
        XCTAssertEqual(
            MacSidebarPreferences.clampedWidth(MacSidebarPreferences.minimumExpandedWidth - 1),
            MacSidebarPreferences.minimumExpandedWidth
        )
        XCTAssertEqual(
            MacSidebarPreferences.clampedWidth(MacSidebarPreferences.minimumExpandedWidth),
            MacSidebarPreferences.minimumExpandedWidth
        )
        XCTAssertEqual(
            MacSidebarPreferences.clampedWidth(MacSidebarPreferences.defaultExpandedWidth),
            MacSidebarPreferences.defaultExpandedWidth
        )
        XCTAssertEqual(
            MacSidebarPreferences.clampedWidth(MacSidebarPreferences.maximumExpandedWidth),
            MacSidebarPreferences.maximumExpandedWidth
        )
        XCTAssertEqual(
            MacSidebarPreferences.clampedWidth(MacSidebarPreferences.maximumExpandedWidth + 1),
            MacSidebarPreferences.maximumExpandedWidth
        )
    }

    func testClampedTextScaleEdgeValues() {
        XCTAssertEqual(
            MacSidebarPreferences.clampedTextScale(MacSidebarPreferences.minimumTextScale - 0.1),
            MacSidebarPreferences.minimumTextScale
        )
        XCTAssertEqual(
            MacSidebarPreferences.clampedTextScale(MacSidebarPreferences.minimumTextScale),
            MacSidebarPreferences.minimumTextScale
        )
        XCTAssertEqual(
            MacSidebarPreferences.clampedTextScale(MacSidebarPreferences.defaultTextScale),
            MacSidebarPreferences.defaultTextScale
        )
        XCTAssertEqual(
            MacSidebarPreferences.clampedTextScale(MacSidebarPreferences.maximumTextScale),
            MacSidebarPreferences.maximumTextScale
        )
        XCTAssertEqual(
            MacSidebarPreferences.clampedTextScale(MacSidebarPreferences.maximumTextScale + 0.1),
            MacSidebarPreferences.maximumTextScale
        )
    }
}
