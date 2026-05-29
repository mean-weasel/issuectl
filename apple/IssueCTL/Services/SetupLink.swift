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
    case sessions
    case reviews
    case board

    init?(url: URL) {
        let components = Self.pathComponents(from: url)
        guard let first = components.first else { return nil }

        switch first {
        case "issues":
            guard let target = Self.repoTarget(from: components) else { return nil }
            self = .issue(owner: target.owner, repo: target.repo, number: target.number)
        case "pulls":
            guard let target = Self.repoTarget(from: components) else { return nil }
            self = .pullRequest(owner: target.owner, repo: target.repo, number: target.number)
        case "sessions":
            self = .sessions
        case "reviews":
            self = .reviews
        case "workbench", "board":
            self = .board
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

    private static func repoTarget(from components: [String]) -> (owner: String, repo: String, number: Int)? {
        guard components.count == 4,
              let number = Int(components[3]),
              number > 0 else {
            return nil
        }
        return (components[1], components[2], number)
    }
}
