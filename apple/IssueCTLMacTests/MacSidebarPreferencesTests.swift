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

        XCTAssertFalse(preferences.isCollapsed)
        XCTAssertEqual(preferences.selectedSectionRawValue, "issues")
        XCTAssertEqual(preferences.expandedWidth, MacSidebarPreferences.defaultExpandedWidth)
    }

    func testPersistsCollapsedSelectedSectionAndExpandedWidth() {
        let preferences = MacSidebarPreferences(defaults: defaults)

        preferences.isCollapsed = true
        preferences.selectedSectionRawValue = "drafts"
        preferences.expandedWidth = 440

        let reloaded = MacSidebarPreferences(defaults: defaults)
        XCTAssertTrue(reloaded.isCollapsed)
        XCTAssertEqual(reloaded.selectedSectionRawValue, "drafts")
        XCTAssertEqual(reloaded.expandedWidth, 440)
    }

    func testLoadsExpandedWidthClampedToSupportedRange() {
        defaults.set(120, forKey: "mac.sidebar.expandedWidth")
        XCTAssertEqual(
            MacSidebarPreferences(defaults: defaults).expandedWidth,
            MacSidebarPreferences.minimumExpandedWidth
        )

        defaults.set(1_200, forKey: "mac.sidebar.expandedWidth")
        XCTAssertEqual(
            MacSidebarPreferences(defaults: defaults).expandedWidth,
            MacSidebarPreferences.maximumExpandedWidth
        )
    }

    func testResetLayoutRestoresAndPersistsDefaults() {
        let preferences = MacSidebarPreferences(defaults: defaults)
        preferences.isCollapsed = true
        preferences.selectedSectionRawValue = "settings"
        preferences.expandedWidth = 520

        preferences.resetLayout()

        XCTAssertFalse(preferences.isCollapsed)
        XCTAssertEqual(preferences.selectedSectionRawValue, "issues")
        XCTAssertEqual(preferences.expandedWidth, MacSidebarPreferences.defaultExpandedWidth)

        let reloaded = MacSidebarPreferences(defaults: defaults)
        XCTAssertFalse(reloaded.isCollapsed)
        XCTAssertEqual(reloaded.selectedSectionRawValue, "issues")
        XCTAssertEqual(reloaded.expandedWidth, MacSidebarPreferences.defaultExpandedWidth)
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
}
