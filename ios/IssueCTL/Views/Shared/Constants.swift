import SwiftUI
import OSLog

enum PerformanceTrace {
    private static let logger = Logger(subsystem: "com.issuectl.ios", category: "performance")
    private static let appLaunchStartedAt = Date()

    struct Token {
        let name: String
        let startedAt: Date
    }

    static func begin(_ name: String, metadata: String = "") -> Token {
        logger.debug("begin \(name, privacy: .public) \(metadata, privacy: .public)")
        return Token(name: name, startedAt: Date())
    }

    static func end(_ token: Token, metadata: String = "") {
        let elapsedMs = Int(Date().timeIntervalSince(token.startedAt) * 1_000)
        logger.info("end \(token.name, privacy: .public) elapsed_ms=\(elapsedMs, privacy: .public) \(metadata, privacy: .public)")
    }

    static func markAppLaunchUsable(_ screen: String) {
        let elapsedMs = Int(Date().timeIntervalSince(appLaunchStartedAt) * 1_000)
        logger.info("app_launch_usable screen=\(screen, privacy: .public) elapsed_ms=\(elapsedMs, privacy: .public)")
    }
}

enum RepoColors {
    /// Same 7-color palette as the web (REPO_COLORS in packages/web/lib/constants.ts).
    /// Colors are assigned by repo index so they match across platforms.
    static let palette: [Color] = [
        Color(hex: "f85149")!, // red
        Color(hex: "58a6ff")!, // blue
        Color(hex: "3fb950")!, // green
        Color(hex: "bc8cff")!, // purple
        Color(hex: "d29922")!, // yellow
        Color(hex: "39d0d6")!, // cyan
        Color(hex: "e87125")!, // orange
    ]

    static func color(for index: Int) -> Color {
        palette[index % palette.count]
    }
}

extension Color {
    init?(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard hex.count == 6,
              let int = UInt64(hex, radix: 16) else { return nil }
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8) & 0xFF) / 255
        let b = Double(int & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
