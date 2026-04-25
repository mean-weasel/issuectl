import Foundation

struct Deployment: Codable, Identifiable, Sendable {
    let id: Int
    let repoId: Int
    let issueNumber: Int
    let branchName: String
    let workspaceMode: String
    let workspacePath: String
    let linkedPrNumber: Int?
    let state: String
    let launchedAt: String
    let endedAt: String?
    let ttydPort: Int?
    let ttydPid: Int?

    var isActive: Bool { state == "active" && endedAt == nil }
}
