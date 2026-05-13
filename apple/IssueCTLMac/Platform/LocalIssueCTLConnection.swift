import Foundation
import SQLite3

struct LocalIssueCTLConnection {
    static let defaultServerURL = "http://localhost:3847"

    let databaseURL: URL
    let serverURL: String

    init(
        databaseURL: URL = Self.defaultDatabaseURL(),
        serverURL: String = Self.defaultServerURL
    ) {
        self.databaseURL = databaseURL
        self.serverURL = serverURL
    }

    static func defaultDatabaseURL(environment: [String: String] = ProcessInfo.processInfo.environment) -> URL {
        if let path = environment["ISSUECTL_DB_PATH"]?.trimmingCharacters(in: .whitespacesAndNewlines),
           !path.isEmpty {
            return URL(fileURLWithPath: NSString(string: path).expandingTildeInPath)
        }

        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".issuectl")
            .appendingPathComponent("issuectl.db")
    }

    func apiToken() throws -> String? {
        guard FileManager.default.fileExists(atPath: databaseURL.path) else {
            return nil
        }

        var database: OpaquePointer?
        let openResult = sqlite3_open_v2(databaseURL.path, &database, SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, nil)
        guard openResult == SQLITE_OK, let database else {
            defer { sqlite3_close(database) }
            throw LocalIssueCTLConnectionError.openFailed(message: sqliteMessage(database))
        }
        defer { sqlite3_close(database) }

        var statement: OpaquePointer?
        let query = "SELECT value FROM settings WHERE key = 'api_token' LIMIT 1"
        guard sqlite3_prepare_v2(database, query, -1, &statement, nil) == SQLITE_OK else {
            defer { sqlite3_finalize(statement) }
            throw LocalIssueCTLConnectionError.queryFailed(message: sqliteMessage(database))
        }
        defer { sqlite3_finalize(statement) }

        guard sqlite3_step(statement) == SQLITE_ROW,
              let tokenPointer = sqlite3_column_text(statement, 0) else {
            return nil
        }

        let token = String(cString: tokenPointer).trimmingCharacters(in: .whitespacesAndNewlines)
        return token.isEmpty ? nil : token
    }

    private func sqliteMessage(_ database: OpaquePointer?) -> String {
        guard let message = sqlite3_errmsg(database) else { return "Unknown SQLite error" }
        return String(cString: message)
    }
}

enum LocalIssueCTLConnectionError: LocalizedError {
    case openFailed(message: String)
    case queryFailed(message: String)

    var errorDescription: String? {
        switch self {
        case .openFailed(let message):
            "Could not open local issuectl database: \(message)"
        case .queryFailed(let message):
            "Could not read local issuectl API token: \(message)"
        }
    }
}
