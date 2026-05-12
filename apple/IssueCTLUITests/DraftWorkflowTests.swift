// ios/IssueCTLUITests/DraftWorkflowTests.swift
import XCTest

final class DraftWorkflowTests: XCTestCase {
    private var server: MockIssueCTLServer!

    override func setUpWithError() throws {
        continueAfterFailure = false
        server = try MockIssueCTLServer()
        try server.start()
    }

    override func tearDownWithError() throws {
        server.stop()
        server = nil
    }

    @MainActor
    func testCreateDraftThenAssignToRepo() {
        let app = launchApp(server: server)

        // Create a draft first (reuse the existing pattern from IssueCTLUITests).
        openQuickCreate(in: app)

        assertElement("issue-title-field", existsIn: app, timeout: 3)
        element("quick-create-repo-more-button", in: app).tap()
        let localDraftButton = app.buttons["quick-create-local-draft-button"]
        if localDraftButton.waitForExistence(timeout: 3) {
            localDraftButton.tap()
        } else {
            app.buttons["quick-create-local-draft-option"].tap()
        }

        element("issue-title-field", in: app).tap()
        app.typeText("Draft to assign")
        element("submit-issue-button", in: app).tap()
        waitForNonexistence("issue-title-field", in: app)

        // Navigate to drafts.
        tapMainTab("issues-tab", label: "Issues", in: app)
        assertElement("section-tab-drafts", existsIn: app, timeout: 8)
        element("section-tab-drafts", in: app).tap()

        // Tap the draft to open DraftDetailView.
        assertElement("draft-row-draft-ui-1", existsIn: app, timeout: 8)
        element("draft-row-draft-ui-1", in: app).tap()

        // DraftDetailView loads repos and shows a selection button per repo.
        // The mock server returns one repo: org/alpha with id=1.
        // DraftDetailView gives it the identifier "assign-repo-1-button".
        let repoButton = element("assign-repo-1-button", in: app)
        XCTAssertTrue(repoButton.waitForExistence(timeout: 5),
                      "Repo selection button 'assign-repo-1-button' missing\n\(app.debugDescription)")
        repoButton.tap()

        // After selecting a repo the "Create Issue in alpha" button appears
        // with accessibility identifier "assign-draft-button".
        // The form may need scrolling to bring the button into view.
        let assignButton = element("assign-draft-button", in: app)
        if !assignButton.waitForExistence(timeout: 3) {
            app.swipeUp()
        }
        XCTAssertTrue(assignButton.waitForExistence(timeout: 5),
                      "Assign draft button missing after repo selection\n\(app.debugDescription)")
        assignButton.tap()

        // After assignment the view dismisses and we return to the list.
        // The draft is consumed; navigate to Open issues to verify we are back.
        openIssuesSection(in: app)
    }

    @MainActor
    private func openQuickCreate(in app: XCUIApplication) {
        if element("today-create-issue-button", in: app).waitForExistence(timeout: 5) {
            element("today-create-issue-button", in: app).tap()
            return
        }

        tapElement("issues-tab", in: app)
        assertElement("issues-create-issue-button", existsIn: app, timeout: 5)
        element("issues-create-issue-button", in: app).tap()
    }
}
