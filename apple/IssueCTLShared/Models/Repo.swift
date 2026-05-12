import Foundation

struct Repo: Codable, Identifiable, Sendable {
    let id: Int
    let owner: String
    let name: String
    let localPath: String?
    let branchPattern: String?
    let createdAt: String

    var fullName: String { "\(owner)/\(name)" }
}

struct ReposResponse: Codable, Sendable {
    let repos: [Repo]
}
