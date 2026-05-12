import Foundation

struct NotificationPreferences: Codable, Equatable, Sendable {
    var idleTerminals: Bool
    var newIssues: Bool
    var mergedPullRequests: Bool

    static let defaults = NotificationPreferences(
        idleTerminals: true,
        newIssues: true,
        mergedPullRequests: true
    )
}
