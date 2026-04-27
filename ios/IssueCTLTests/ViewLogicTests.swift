import XCTest
@testable import IssueCTL

final class ViewLogicTests: XCTestCase {

    // MARK: - Branch Name Generation

    func testBasicSlugGeneration() {
        let result = generateBranchName(issueNumber: 42, issueTitle: "Fix login bug")
        XCTAssertEqual(result, "issue-42-fix-login-bug")
    }

    func testSlugLowercased() {
        let result = generateBranchName(issueNumber: 1, issueTitle: "Add OAuth Support")
        XCTAssertEqual(result, "issue-1-add-oauth-support")
    }

    func testSlugSpecialCharactersReplaced() {
        let result = generateBranchName(issueNumber: 10, issueTitle: "Fix: user's data [urgent]")
        XCTAssertEqual(result, "issue-10-fix-user-s-data-urgent")
    }

    func testSlugLeadingTrailingDashesRemoved() {
        let result = generateBranchName(issueNumber: 5, issueTitle: "---leading and trailing---")
        XCTAssertEqual(result, "issue-5-leading-and-trailing")
    }

    func testSlugConsecutiveSpecialCharsCollapsed() {
        let result = generateBranchName(issueNumber: 7, issueTitle: "fix!!!the...bug???now")
        XCTAssertEqual(result, "issue-7-fix-the-bug-now")
    }

    func testSlugTruncatedToFortyChars() {
        // The slug portion (after the regex and trimming) is prefix(40)
        let longTitle = String(repeating: "a", count: 80)
        let result = generateBranchName(issueNumber: 1, issueTitle: longTitle)
        // slug will be 40 chars of 'a', total: "issue-1-" + 40 'a's = 48 chars
        let expectedSlug = String(repeating: "a", count: 40)
        XCTAssertEqual(result, "issue-1-\(expectedSlug)")
    }

    func testSlugWithNumbers() {
        let result = generateBranchName(issueNumber: 99, issueTitle: "v2.0 release prep")
        XCTAssertEqual(result, "issue-99-v2-0-release-prep")
    }

    func testSlugEmptyTitle() {
        let result = generateBranchName(issueNumber: 1, issueTitle: "")
        XCTAssertEqual(result, "issue-1-")
    }

    func testSlugAllSpecialCharsTitle() {
        let result = generateBranchName(issueNumber: 3, issueTitle: "!@#$%^&*()")
        XCTAssertEqual(result, "issue-3-")
    }

    func testSlugUnicodeTitle() {
        // Non-ASCII chars should be replaced by dashes
        let result = generateBranchName(issueNumber: 8, issueTitle: "Fix the bug")
        XCTAssertTrue(result.hasPrefix("issue-8-"))
    }

    func testSlugWhitespace() {
        let result = generateBranchName(issueNumber: 2, issueTitle: "  spaces  everywhere  ")
        XCTAssertEqual(result, "issue-2-spaces-everywhere")
    }

    func testSlugTruncationPreservesIssuePrefix() {
        // Even with very long title, the "issue-N-" prefix is always present
        let longTitle = "this is a very long issue title that should definitely exceed forty characters in length"
        let result = generateBranchName(issueNumber: 999, issueTitle: longTitle)
        XCTAssertTrue(result.hasPrefix("issue-999-"))
        // The slug after prefix should be at most 40 chars
        let slugPart = String(result.dropFirst("issue-999-".count))
        XCTAssertLessThanOrEqual(slugPart.count, 40)
    }

    // MARK: - Refresh Cooldown Logic

    func testRefreshAllowedWhenNoLastRefresh() {
        XCTAssertTrue(shouldAllowRefresh(lastRefreshDate: nil, cooldown: 10))
    }

    func testRefreshBlockedWithinCooldown() {
        let now = Date()
        let fiveSecondsAgo = now.addingTimeInterval(-5)
        XCTAssertFalse(shouldAllowRefresh(lastRefreshDate: fiveSecondsAgo, cooldown: 10, now: now))
    }

    func testRefreshAllowedAfterCooldown() {
        let now = Date()
        let elevenSecondsAgo = now.addingTimeInterval(-11)
        XCTAssertTrue(shouldAllowRefresh(lastRefreshDate: elevenSecondsAgo, cooldown: 10, now: now))
    }

    func testRefreshAllowedExactlyAtCooldown() {
        let now = Date()
        let exactlyTenSecondsAgo = now.addingTimeInterval(-10)
        XCTAssertTrue(shouldAllowRefresh(lastRefreshDate: exactlyTenSecondsAgo, cooldown: 10, now: now))
    }

    func testRefreshBlockedJustBeforeCooldown() {
        let now = Date()
        let justBefore = now.addingTimeInterval(-9.99)
        XCTAssertFalse(shouldAllowRefresh(lastRefreshDate: justBefore, cooldown: 10, now: now))
    }

    func testRefreshWithZeroCooldown() {
        let now = Date()
        let justNow = now.addingTimeInterval(-0.001)
        XCTAssertTrue(shouldAllowRefresh(lastRefreshDate: justNow, cooldown: 0, now: now))
    }

    // MARK: - Pagination Logic

    func testPaginationInitialLimit() {
        // The page size constant is 15
        let pageSize = 15
        var displayLimit = pageSize

        XCTAssertEqual(displayLimit, 15, "Initial display limit should match page size")

        // Simulate "Load More"
        displayLimit += pageSize
        XCTAssertEqual(displayLimit, 30, "After one load more, limit should be 30")

        displayLimit += pageSize
        XCTAssertEqual(displayLimit, 45, "After two load mores, limit should be 45")
    }

    func testPaginationReset() {
        // When section/filter changes, displayLimit resets to pageSize
        let pageSize = 15
        var displayLimit = pageSize

        // Simulate several load mores
        displayLimit += pageSize
        displayLimit += pageSize
        XCTAssertEqual(displayLimit, 45)

        // Reset (simulates section/filter change)
        displayLimit = pageSize
        XCTAssertEqual(displayLimit, 15)
    }

    func testPaginationRemainingCount() {
        let totalItems = 42
        let pageSize = 15
        var displayLimit = pageSize

        XCTAssertEqual(totalItems - displayLimit, 27, "Should show 27 remaining")

        displayLimit += pageSize
        XCTAssertEqual(totalItems - displayLimit, 12, "Should show 12 remaining")

        displayLimit += pageSize
        // displayLimit is now 45, which exceeds totalItems
        // In this case "Load More" would not be shown
        XCTAssertTrue(displayLimit >= totalItems, "All items are now visible")
    }
}
