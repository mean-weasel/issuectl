import Foundation
import OSLog

enum PerformanceTrace {
    private static let logger = Logger(subsystem: "com.issuectl.mac", category: "performance")

    struct Token {
        let name: String
        let startedAt: Date
    }

    static func markAppLaunchStarted() {}

    static func begin(_ name: String, metadata: String = "") -> Token {
        logger.debug("begin \(name, privacy: .public) \(metadata, privacy: .public)")
        return Token(name: name, startedAt: Date())
    }

    static func end(_ token: Token, metadata: String = "") {
        let elapsedMs = Int(Date().timeIntervalSince(token.startedAt) * 1_000)
        logger.info("end \(token.name, privacy: .public) elapsed_ms=\(elapsedMs, privacy: .public) \(metadata, privacy: .public)")
    }
}
