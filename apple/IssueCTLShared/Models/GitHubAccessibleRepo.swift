import Foundation

struct GitHubAccessibleRepo: Codable, Identifiable, Sendable {
    let owner: String
    let name: String
    let `private`: Bool
    let pushedAt: String?

    var id: String { "\(owner)/\(name)" }
    var fullName: String { "\(owner)/\(name)" }
}

struct GitHubAccessibleReposResponse: Codable, Sendable {
    let repos: [GitHubAccessibleRepo]
    let syncedAt: Int?
    let isStale: Bool
}
