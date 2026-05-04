import SwiftUI
import OSLog

enum PerformanceTrace {
    private static let logger = Logger(subsystem: "com.issuectl.ios", category: "performance")
    private static let appLaunchStartedAt = Date()
    private static let testLogQueue = DispatchQueue(label: "com.issuectl.ios.performance-trace-test-log")
    private static let testLogFileName = "IssueCTLPerformanceTrace.log"

    struct Token {
        let name: String
        let startedAt: Date
    }

    static func markAppLaunchStarted() {
        _ = appLaunchStartedAt
        resetTestLog()
    }

    static func begin(_ name: String, metadata: String = "") -> Token {
        logger.debug("begin \(name, privacy: .public) \(metadata, privacy: .public)")
        testLog("begin \(name) \(metadata)")
        return Token(name: name, startedAt: Date())
    }

    static func end(_ token: Token, metadata: String = "") {
        let elapsedMs = Int(Date().timeIntervalSince(token.startedAt) * 1_000)
        logger.info("end \(token.name, privacy: .public) elapsed_ms=\(elapsedMs, privacy: .public) \(metadata, privacy: .public)")
        testLog("end \(token.name) elapsed_ms=\(elapsedMs) \(metadata)")
    }

    static func markAppLaunchUsable(_ screen: String) {
        let elapsedMs = Int(Date().timeIntervalSince(appLaunchStartedAt) * 1_000)
        logger.info("app_launch_usable screen=\(screen, privacy: .public) elapsed_ms=\(elapsedMs, privacy: .public)")
        testLog("app_launch_usable screen=\(screen) elapsed_ms=\(elapsedMs)")
    }

    private static func testLog(_ message: String) {
        guard ProcessInfo.processInfo.environment["ISSUECTL_UI_TESTING"] == "1" else { return }
        let line = "[PerformanceTrace] \(message)"
        NSLog("%@", line)
        writeTestLog(line)
    }

    private static func resetTestLog() {
        guard ProcessInfo.processInfo.environment["ISSUECTL_UI_TESTING"] == "1" else { return }
        testLogQueue.sync {
            do {
                try FileManager.default.createDirectory(
                    at: testLogURL.deletingLastPathComponent(),
                    withIntermediateDirectories: true
                )
                try Data().write(to: testLogURL, options: .atomic)
            } catch {
                NSLog("[PerformanceTrace] failed_to_reset_file error=%@", error.localizedDescription)
            }
        }
    }

    private static func writeTestLog(_ line: String) {
        testLogQueue.sync {
            do {
                try FileManager.default.createDirectory(
                    at: testLogURL.deletingLastPathComponent(),
                    withIntermediateDirectories: true
                )
                if !FileManager.default.fileExists(atPath: testLogURL.path) {
                    FileManager.default.createFile(atPath: testLogURL.path, contents: nil)
                }
                let handle = try FileHandle(forWritingTo: testLogURL)
                try handle.seekToEnd()
                try handle.write(contentsOf: Data((line + "\n").utf8))
                try handle.close()
            } catch {
                NSLog("[PerformanceTrace] failed_to_write_file error=%@", error.localizedDescription)
            }
        }
    }

    private static var testLogURL: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(testLogFileName)
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
