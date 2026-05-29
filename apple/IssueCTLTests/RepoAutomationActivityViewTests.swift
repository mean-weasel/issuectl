import XCTest
@testable import IssueCTL

final class RepoAutomationActivityViewTests: XCTestCase {

    func testActivityQueryLeavesRepoWideFiltersEmptyByDefault() {
        let query = RepoAutomationActivityQuery()

        XCTAssertNil(query.webhookTargetType)
        XCTAssertNil(query.webhookTargetNumber)
        XCTAssertNil(query.reviewPRNumber)
        XCTAssertEqual(query.reviewStatus, .all)
    }

    func testActivityQueryUsesPullRequestNumberForBothLists() {
        var query = RepoAutomationActivityQuery()
        query.scope = .pullRequests
        query.numberText = " 563 "
        query.reviewStatus = .completed

        XCTAssertEqual(query.webhookTargetType, .pr)
        XCTAssertEqual(query.webhookTargetNumber, 563)
        XCTAssertEqual(query.reviewPRNumber, 563)
        XCTAssertEqual(query.reviewStatus, .completed)
    }

    func testActivityQueryDoesNotSendIssueNumberToReviewRuns() {
        var query = RepoAutomationActivityQuery()
        query.scope = .issues
        query.numberText = "560"

        XCTAssertEqual(query.webhookTargetType, .issue)
        XCTAssertEqual(query.webhookTargetNumber, 560)
        XCTAssertNil(query.reviewPRNumber)
    }

    func testActivityQueryIgnoresInvalidNumberText() {
        var query = RepoAutomationActivityQuery()
        query.scope = .pullRequests
        query.numberText = "PR-563"

        XCTAssertEqual(query.webhookTargetType, .pr)
        XCTAssertNil(query.webhookTargetNumber)
        XCTAssertNil(query.reviewPRNumber)
    }
}
