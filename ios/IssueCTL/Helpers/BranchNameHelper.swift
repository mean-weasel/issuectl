import Foundation

/// Slug: lowercase, non-alphanumeric collapsed to dashes, capped at 40 chars.
func generateBranchName(issueNumber: Int, issueTitle: String) -> String {
    let slug = issueTitle
        .lowercased()
        .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
        .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        .prefix(40)
    return "issue-\(issueNumber)-\(slug)"
}

func shouldAllowRefresh(lastRefreshDate: Date?, cooldown: TimeInterval, now: Date = Date()) -> Bool {
    guard let last = lastRefreshDate else { return true }
    return now.timeIntervalSince(last) >= cooldown
}
