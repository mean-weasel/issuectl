import Foundation

/// Pure function that generates a branch name from an issue number and title.
/// Matches the slug logic used in LaunchView.
func generateBranchName(issueNumber: Int, issueTitle: String) -> String {
    let slug = issueTitle
        .lowercased()
        .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
        .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        .prefix(40)
    return "issue-\(issueNumber)-\(slug)"
}

/// Checks whether a refresh should be allowed based on cooldown.
/// Returns true if enough time has passed since the last refresh, or if there was no prior refresh.
func shouldAllowRefresh(lastRefreshDate: Date?, cooldown: TimeInterval, now: Date = Date()) -> Bool {
    guard let last = lastRefreshDate else { return true }
    return now.timeIntervalSince(last) >= cooldown
}
