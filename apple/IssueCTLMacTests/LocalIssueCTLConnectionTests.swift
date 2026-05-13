import SQLite3
import XCTest
@testable import IssueCTLMac

final class LocalIssueCTLConnectionTests: XCTestCase {
    private var temporaryDirectory: URL!

    override func setUpWithError() throws {
        try super.setUpWithError()
        temporaryDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("issuectl-local-connection-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        if let temporaryDirectory {
            try? FileManager.default.removeItem(at: temporaryDirectory)
        }
        temporaryDirectory = nil
        try super.tearDownWithError()
    }

    func testDefaultDatabaseURLUsesEnvironmentOverride() {
        let url = LocalIssueCTLConnection.defaultDatabaseURL(environment: [
            "ISSUECTL_DB_PATH": "~/custom/issuectl.db",
        ])

        XCTAssertTrue(url.path.hasSuffix("/custom/issuectl.db"))
        XCTAssertFalse(url.path.contains("~"))
    }

    func testDefaultDatabaseURLFallsBackToHomeIssueCTLDatabase() {
        let url = LocalIssueCTLConnection.defaultDatabaseURL(environment: [:])

        XCTAssertTrue(url.path.hasSuffix("/.issuectl/issuectl.db"))
    }

    func testAPITokenReadsStoredSetting() throws {
        let databaseURL = temporaryDirectory.appendingPathComponent("issuectl.db")
        try createSettingsDatabase(at: databaseURL, token: "test-token")

        let connection = LocalIssueCTLConnection(databaseURL: databaseURL)

        XCTAssertEqual(try connection.apiToken(), "test-token")
    }

    func testAPITokenReturnsNilForMissingDatabase() throws {
        let databaseURL = temporaryDirectory.appendingPathComponent("missing.db")
        let connection = LocalIssueCTLConnection(databaseURL: databaseURL)

        XCTAssertNil(try connection.apiToken())
    }

    func testAPITokenReturnsNilWhenSettingIsAbsent() throws {
        let databaseURL = temporaryDirectory.appendingPathComponent("issuectl.db")
        try createSettingsDatabase(at: databaseURL, token: nil)

        let connection = LocalIssueCTLConnection(databaseURL: databaseURL)

        XCTAssertNil(try connection.apiToken())
    }

    private func createSettingsDatabase(at url: URL, token: String?) throws {
        var database: OpaquePointer?
        XCTAssertEqual(sqlite3_open(url.path, &database), SQLITE_OK)
        defer { sqlite3_close(database) }

        XCTAssertEqual(
            sqlite3_exec(database, "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)", nil, nil, nil),
            SQLITE_OK
        )

        if let token {
            var statement: OpaquePointer?
            XCTAssertEqual(
                sqlite3_prepare_v2(database, "INSERT INTO settings (key, value) VALUES ('api_token', ?)", -1, &statement, nil),
                SQLITE_OK
            )
            defer { sqlite3_finalize(statement) }

            let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
            sqlite3_bind_text(statement, 1, token, -1, transient)
            XCTAssertEqual(sqlite3_step(statement), SQLITE_DONE)
        }
    }
}
