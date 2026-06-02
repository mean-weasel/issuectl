import Foundation

struct SetupLink: Equatable, Sendable {
    let serverURL: String
    let token: String

    init?(url: URL) {
        guard ["issuectl", "issuectl-preview"].contains(url.scheme), url.host == "setup" else {
            return nil
        }

        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let serverURL = components.queryItems?.first(where: { $0.name == "serverURL" })?.value,
              let token = components.queryItems?.first(where: { $0.name == "token" })?.value,
              !serverURL.isEmpty,
              !token.isEmpty else {
            return nil
        }

        self.serverURL = serverURL
        self.token = token
    }
}

enum AppRoute: Equatable, Sendable {
    case issue(owner: String, repo: String, number: Int)
    case pullRequest(owner: String, repo: String, number: Int)
    case sessions(repoFullName: String?, deploymentId: Int?)
    case review(id: String)
    case board(repoFullName: String?, issueNumber: Int?, deploymentId: Int?)

    init?(url: URL) {
        let components = Self.pathComponents(from: url)
        guard let first = components.first else { return nil }
        let query = Self.queryItems(from: url)
        let repoFullName = query.first(where: { $0.name == "repo" })?.value
        let deploymentId = Self.intQuery(["deploymentId", "deployment"], from: query)
        let issueNumber = Self.intQuery(["issueNumber", "issue"], from: query)

        switch first {
        case "issues":
            guard let target = Self.repoTarget(from: components) else { return nil }
            self = .issue(owner: target.owner, repo: target.repo, number: target.number)
        case "pulls":
            guard let target = Self.repoTarget(from: components) else { return nil }
            self = .pullRequest(owner: target.owner, repo: target.repo, number: target.number)
        case "sessions":
            self = .sessions(repoFullName: repoFullName, deploymentId: deploymentId)
        case "reviews", "review":
            let id = components.dropFirst().first ?? query.first(where: { $0.name == "id" })?.value
            guard let id, !id.isEmpty else { return nil }
            self = .review(id: id)
        case "workbench", "board":
            self = .board(repoFullName: repoFullName, issueNumber: issueNumber, deploymentId: deploymentId)
        default:
            return nil
        }
    }

    init?(notificationUserInfo userInfo: [AnyHashable: Any]) {
        guard let urlString = userInfo["url"] as? String,
              let url = URL(string: urlString) else {
            return nil
        }
        self.init(url: url)
    }

    private static func pathComponents(from url: URL) -> [String] {
        var components: [String] = []
        if let host = url.host, !host.isEmpty {
            components.append(host)
        }
        components.append(contentsOf: url.pathComponents.filter { $0 != "/" })
        return components.map { $0.removingPercentEncoding ?? $0 }
    }

    private static func queryItems(from url: URL) -> [URLQueryItem] {
        URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    }

    private static func intQuery(_ names: [String], from query: [URLQueryItem]) -> Int? {
        for name in names {
            if let value = query.first(where: { $0.name == name })?.value,
               let number = Int(value) {
                return number
            }
        }
        return nil
    }

    private static func repoTarget(from components: [String]) -> (owner: String, repo: String, number: Int)? {
        guard components.count == 4,
              let number = Int(components[3]),
              number > 0 else {
            return nil
        }
        return (components[1], components[2], number)
    }
}
