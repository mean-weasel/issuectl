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
        XCTAssertEqual(preferences.textScale, MacSidebarPreferences.defaultTextScale)
    }

    func testPersistsCollapsedSelectedSectionAndExpandedWidth() {
        let preferences = MacSidebarPreferences(defaults: defaults)

        preferences.isCollapsed = true
        preferences.selectedSectionRawValue = "drafts"
        preferences.expandedWidth = 440
        preferences.textScale = 1.25

        let reloaded = MacSidebarPreferences(defaults: defaults)
        XCTAssertTrue(reloaded.isCollapsed)
        XCTAssertEqual(reloaded.selectedSectionRawValue, "drafts")
        XCTAssertEqual(reloaded.expandedWidth, 440)
        XCTAssertEqual(reloaded.textScale, 1.25)
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
        preferences.isCollapsed = true
        preferences.selectedSectionRawValue = "settings"
        preferences.expandedWidth = 520
        preferences.textScale = 1.3

        preferences.resetLayout()

        XCTAssertFalse(preferences.isCollapsed)
        XCTAssertEqual(preferences.selectedSectionRawValue, "issues")
        XCTAssertEqual(preferences.expandedWidth, MacSidebarPreferences.defaultExpandedWidth)
        XCTAssertEqual(preferences.textScale, MacSidebarPreferences.defaultTextScale)

        let reloaded = MacSidebarPreferences(defaults: defaults)
        XCTAssertFalse(reloaded.isCollapsed)
        XCTAssertEqual(reloaded.selectedSectionRawValue, "issues")
        XCTAssertEqual(reloaded.expandedWidth, MacSidebarPreferences.defaultExpandedWidth)
        XCTAssertEqual(reloaded.textScale, MacSidebarPreferences.defaultTextScale)
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
