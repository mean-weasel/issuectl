import Foundation

struct SetupLink: Equatable, Sendable {
    let serverURL: String
    let token: String

    init?(url: URL) {
        guard url.scheme == "issuectl", url.host == "setup" else {
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
