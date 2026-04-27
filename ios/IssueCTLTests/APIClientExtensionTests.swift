import XCTest
@testable import IssueCTL

/// Tests for APIClient extension endpoints (Drafts, Assignment, DetailActions, Priority).
/// Reuses MockURLProtocol and TestableAPIClient from APIClientTests.swift.
final class APIClientExtensionTests: XCTestCase {

    private var client: TestableAPIClient!

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    @MainActor
    override func setUp() async throws {
        try await super.setUp()
        client = TestableAPIClient()
    }

    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        super.tearDown()
    }

    // MARK: - Helper

    private func makeResponse(url: URL, status: Int = 200) -> HTTPURLResponse {
        HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
    }

    private func readBody(from request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        var data = Data()
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
        while stream.hasBytesAvailable {
            let read = stream.read(buffer, maxLength: 4096)
            if read > 0 { data.append(buffer, count: read) }
        }
        buffer.deallocate()
        stream.close()
        return data
    }

    // MARK: - Drafts (APIClient+Drafts)

    @MainActor
    func testUpdateDraftURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/drafts/draft-123"))
            XCTAssertEqual(request.httpMethod, "PATCH")
            return (self.makeResponse(url: request.url!), """
            {"success": true, "draft": {"id": "draft-123", "title": "Updated", "body": null, "priority": null, "created_at": 100.0}, "error": null}
            """.data(using: .utf8)!)
        }

        let body = UpdateDraftRequestBody(title: "Updated", body: nil, priority: nil)
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await client.request(path: "/api/v1/drafts/draft-123", method: "PATCH", body: bodyData)
        let response = try decoder.decode(UpdateDraftResponse.self, from: data)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.draft?.title, "Updated")
    }

    @MainActor
    func testUpdateDraftBodyEncoding() async throws {
        MockURLProtocol.requestHandler = { request in
            let bodyData = self.readBody(from: request)
            XCTAssertNotNil(bodyData)
            if let bodyData {
                let json = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any]
                XCTAssertEqual(json?["title"] as? String, "New Title")
                XCTAssertEqual(json?["body"] as? String, "New Body")
                XCTAssertEqual(json?["priority"] as? String, "high")
            }
            return (self.makeResponse(url: request.url!), """
            {"success": true, "draft": null, "error": null}
            """.data(using: .utf8)!)
        }

        let body = UpdateDraftRequestBody(title: "New Title", body: "New Body", priority: .high)
        let bodyData = try JSONEncoder().encode(body)
        _ = try await client.request(path: "/api/v1/drafts/draft-1", method: "PATCH", body: bodyData)
    }

    @MainActor
    func testRepoLabelsURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/repos/org/app/labels"))
            XCTAssertEqual(request.httpMethod, "GET")
            return (self.makeResponse(url: request.url!), """
            {"labels": [{"name": "bug", "color": "d73a4a", "description": "Something broken"}]}
            """.data(using: .utf8)!)
        }

        let (data, _) = try await client.request(path: "/api/v1/repos/org/app/labels")
        let response = try decoder.decode(LabelsResponse.self, from: data)
        XCTAssertEqual(response.labels.count, 1)
        XCTAssertEqual(response.labels[0].name, "bug")
    }

    @MainActor
    func testAssignDraftWithLabelsURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/drafts/draft-abc/assign"))
            XCTAssertEqual(request.httpMethod, "POST")

            let bodyData = self.readBody(from: request)
            if let bodyData {
                let json = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any]
                XCTAssertEqual(json?["repoId"] as? Int, 42)
                XCTAssertEqual(json?["labels"] as? [String], ["bug", "enhancement"])
            }

            return (self.makeResponse(url: request.url!), """
            {"success": true, "issue_number": 99, "issue_url": "https://github.com/org/repo/issues/99", "cleanup_warning": null, "labels_warning": null, "error": null}
            """.data(using: .utf8)!)
        }

        let body = AssignDraftWithLabelsRequestBody(repoId: 42, labels: ["bug", "enhancement"])
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await client.request(path: "/api/v1/drafts/draft-abc/assign", method: "POST", body: bodyData)
        let response = try decoder.decode(AssignDraftResponse.self, from: data)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.issueNumber, 99)
    }

    // MARK: - Assignment (APIClient+Assignment)

    @MainActor
    func testCollaboratorsURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/repos/neonwatty/issuectl/collaborators"))
            XCTAssertEqual(request.httpMethod, "GET")
            return (self.makeResponse(url: request.url!), """
            {"collaborators": [{"login": "dev1", "avatar_url": "https://github.com/dev1.png"}]}
            """.data(using: .utf8)!)
        }

        let (data, _) = try await client.request(path: "/api/v1/repos/neonwatty/issuectl/collaborators")
        let response = try decoder.decode(CollaboratorsResponse.self, from: data)
        XCTAssertEqual(response.collaborators.count, 1)
        XCTAssertEqual(response.collaborators[0].login, "dev1")
    }

    @MainActor
    func testUpdateAssigneesURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/issues/org/repo/42/assignees"))
            XCTAssertEqual(request.httpMethod, "PUT")
            return (self.makeResponse(url: request.url!), """
            {"assignees": ["dev1", "dev2"]}
            """.data(using: .utf8)!)
        }

        let body = try JSONEncoder().encode(["assignees": ["dev1", "dev2"]])
        let (data, _) = try await client.request(path: "/api/v1/issues/org/repo/42/assignees", method: "PUT", body: body)
        let response = try decoder.decode(AssigneesUpdateResponse.self, from: data)
        XCTAssertEqual(response.assignees, ["dev1", "dev2"])
    }

    @MainActor
    func testUpdateAssigneesBodyEncoding() async throws {
        MockURLProtocol.requestHandler = { request in
            let bodyData = self.readBody(from: request)
            if let bodyData {
                let json = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any]
                XCTAssertEqual(json?["assignees"] as? [String], ["userA", "userB"])
            }
            return (self.makeResponse(url: request.url!), """
            {"assignees": ["userA", "userB"]}
            """.data(using: .utf8)!)
        }

        let body = try JSONEncoder().encode(["assignees": ["userA", "userB"]])
        _ = try await client.request(path: "/api/v1/issues/o/r/1/assignees", method: "PUT", body: body)
    }

    // MARK: - DetailActions (APIClient+DetailActions)

    @MainActor
    func testUpdateIssueURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/issues/org/repo/10"))
            XCTAssertEqual(request.httpMethod, "PATCH")
            return (self.makeResponse(url: request.url!), """
            {"success": true, "error": null}
            """.data(using: .utf8)!)
        }

        let body = UpdateIssueRequestBody(title: "Updated title", body: "Updated body")
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await client.request(path: "/api/v1/issues/org/repo/10", method: "PATCH", body: bodyData)
        let response = try decoder.decode(UpdateIssueResponse.self, from: data)
        XCTAssertTrue(response.success)
    }

    @MainActor
    func testUpdateIssueBodyEncoding() async throws {
        MockURLProtocol.requestHandler = { request in
            let bodyData = self.readBody(from: request)
            if let bodyData {
                let json = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any]
                XCTAssertEqual(json?["title"] as? String, "New Title")
                XCTAssertEqual(json?["body"] as? String, "New Body")
            }
            return (self.makeResponse(url: request.url!), """
            {"success": true, "error": null}
            """.data(using: .utf8)!)
        }

        let body = UpdateIssueRequestBody(title: "New Title", body: "New Body")
        let bodyData = try JSONEncoder().encode(body)
        _ = try await client.request(path: "/api/v1/issues/org/repo/10", method: "PATCH", body: bodyData)
    }

    @MainActor
    func testEditCommentURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/issues/org/repo/5/comments"))
            XCTAssertEqual(request.httpMethod, "PATCH")
            return (self.makeResponse(url: request.url!), """
            {"success": true, "error": null}
            """.data(using: .utf8)!)
        }

        let body = EditCommentRequestBody(commentId: 123, body: "Updated comment")
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await client.request(path: "/api/v1/issues/org/repo/5/comments", method: "PATCH", body: bodyData)
        let response = try decoder.decode(EditCommentResponse.self, from: data)
        XCTAssertTrue(response.success)
    }

    @MainActor
    func testEditCommentBodyEncoding() async throws {
        MockURLProtocol.requestHandler = { request in
            let bodyData = self.readBody(from: request)
            if let bodyData {
                let json = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any]
                XCTAssertEqual(json?["commentId"] as? Int, 555)
                XCTAssertEqual(json?["body"] as? String, "Fixed typo")
            }
            return (self.makeResponse(url: request.url!), """
            {"success": true, "error": null}
            """.data(using: .utf8)!)
        }

        let body = EditCommentRequestBody(commentId: 555, body: "Fixed typo")
        let bodyData = try JSONEncoder().encode(body)
        _ = try await client.request(path: "/api/v1/issues/org/repo/1/comments", method: "PATCH", body: bodyData)
    }

    @MainActor
    func testDeleteCommentURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/issues/org/repo/5/comments"))
            XCTAssertEqual(request.httpMethod, "DELETE")
            return (self.makeResponse(url: request.url!), """
            {"success": true, "error": null}
            """.data(using: .utf8)!)
        }

        let body = DeleteCommentRequestBody(commentId: 99)
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await client.request(path: "/api/v1/issues/org/repo/5/comments", method: "DELETE", body: bodyData)
        let response = try decoder.decode(DeleteCommentResponse.self, from: data)
        XCTAssertTrue(response.success)
    }

    @MainActor
    func testToggleLabelURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/issues/org/repo/7/labels"))
            XCTAssertEqual(request.httpMethod, "POST")
            return (self.makeResponse(url: request.url!), """
            {"success": true, "error": null}
            """.data(using: .utf8)!)
        }

        let body = ToggleLabelRequestBody(label: "bug", action: "add")
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await client.request(path: "/api/v1/issues/org/repo/7/labels", method: "POST", body: bodyData)
        let response = try decoder.decode(ToggleLabelResponse.self, from: data)
        XCTAssertTrue(response.success)
    }

    @MainActor
    func testToggleLabelBodyEncoding() async throws {
        MockURLProtocol.requestHandler = { request in
            let bodyData = self.readBody(from: request)
            if let bodyData {
                let json = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any]
                XCTAssertEqual(json?["label"] as? String, "enhancement")
                XCTAssertEqual(json?["action"] as? String, "remove")
            }
            return (self.makeResponse(url: request.url!), """
            {"success": true, "error": null}
            """.data(using: .utf8)!)
        }

        let body = ToggleLabelRequestBody(label: "enhancement", action: "remove")
        let bodyData = try JSONEncoder().encode(body)
        _ = try await client.request(path: "/api/v1/issues/org/repo/7/labels", method: "POST", body: bodyData)
    }

    @MainActor
    func testListRepoLabelsURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/repos/org/repo/labels"))
            XCTAssertEqual(request.httpMethod, "GET")
            return (self.makeResponse(url: request.url!), """
            {"labels": [{"name": "bug", "color": "d73a4a", "description": null}, {"name": "docs", "color": "0075ca", "description": "Documentation"}]}
            """.data(using: .utf8)!)
        }

        let (data, _) = try await client.request(path: "/api/v1/repos/org/repo/labels")
        let response = try decoder.decode(LabelsListResponse.self, from: data)
        XCTAssertEqual(response.labels.count, 2)
        XCTAssertEqual(response.labels[0].name, "bug")
        XCTAssertEqual(response.labels[1].name, "docs")
    }

    // MARK: - Priority (APIClient+Priority)

    @MainActor
    func testGetPriorityURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/issues/org/repo/42/priority"))
            XCTAssertEqual(request.httpMethod, "GET")
            return (self.makeResponse(url: request.url!), """
            {"priority": "high"}
            """.data(using: .utf8)!)
        }

        let (data, _) = try await client.request(path: "/api/v1/issues/org/repo/42/priority")
        let response = try decoder.decode(PriorityResponse.self, from: data)
        XCTAssertEqual(response.priority, .high)
    }

    @MainActor
    func testListPrioritiesURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/issues/org/repo/priorities"))
            XCTAssertEqual(request.httpMethod, "GET")
            return (self.makeResponse(url: request.url!), """
            {"priorities": [{"repo_id": 1, "issue_number": 10, "priority": "high", "updated_at": 1714200000}]}
            """.data(using: .utf8)!)
        }

        let (data, _) = try await client.request(path: "/api/v1/issues/org/repo/priorities")
        let response = try decoder.decode(PrioritiesListResponse.self, from: data)
        XCTAssertEqual(response.priorities.count, 1)
        XCTAssertEqual(response.priorities[0].priority, .high)
    }

    @MainActor
    func testSetPriorityURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/issues/org/repo/42/priority"))
            XCTAssertEqual(request.httpMethod, "PUT")
            return (self.makeResponse(url: request.url!), """
            {"success": true, "error": null}
            """.data(using: .utf8)!)
        }

        let body = SetPriorityRequestBody(priority: "high")
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await client.request(path: "/api/v1/issues/org/repo/42/priority", method: "PUT", body: bodyData)
        let response = try decoder.decode(SetPriorityResponse.self, from: data)
        XCTAssertTrue(response.success)
    }

    @MainActor
    func testSetPriorityBodyEncoding() async throws {
        MockURLProtocol.requestHandler = { request in
            let bodyData = self.readBody(from: request)
            if let bodyData {
                let json = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any]
                XCTAssertEqual(json?["priority"] as? String, "low")
            }
            return (self.makeResponse(url: request.url!), """
            {"success": true, "error": null}
            """.data(using: .utf8)!)
        }

        let body = SetPriorityRequestBody(priority: Priority.low.rawValue)
        let bodyData = try JSONEncoder().encode(body)
        _ = try await client.request(path: "/api/v1/issues/org/repo/1/priority", method: "PUT", body: bodyData)
    }

    // MARK: - Response Decoding

    @MainActor
    func testUpdateDraftResponseDecoding() throws {
        let json = """
        {"success": true, "draft": {"id": "d1", "title": "T", "body": "B", "priority": "low", "created_at": 100.0}, "error": null}
        """.data(using: .utf8)!
        let response = try decoder.decode(UpdateDraftResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.draft?.id, "d1")
        XCTAssertEqual(response.draft?.priority, .low)
        XCTAssertNil(response.error)
    }

    @MainActor
    func testUpdateDraftResponseFailure() throws {
        let json = """
        {"success": false, "draft": null, "error": "Draft not found"}
        """.data(using: .utf8)!
        let response = try decoder.decode(UpdateDraftResponse.self, from: json)
        XCTAssertFalse(response.success)
        XCTAssertNil(response.draft)
        XCTAssertEqual(response.error, "Draft not found")
    }

    @MainActor
    func testCollaboratorInfoDecoding() throws {
        let json = """
        {"login": "dev1", "avatar_url": "https://avatars.com/dev1.png"}
        """.data(using: .utf8)!
        let collaborator = try decoder.decode(CollaboratorInfo.self, from: json)
        XCTAssertEqual(collaborator.login, "dev1")
        XCTAssertEqual(collaborator.avatarUrl, "https://avatars.com/dev1.png")
        XCTAssertEqual(collaborator.id, "dev1")
    }

    @MainActor
    func testSetPriorityResponseDecoding() throws {
        let json = """
        {"success": true, "error": null}
        """.data(using: .utf8)!
        let response = try decoder.decode(SetPriorityResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertNil(response.error)
    }

    @MainActor
    func testSetPriorityResponseFailure() throws {
        let json = """
        {"success": false, "error": "Issue not found"}
        """.data(using: .utf8)!
        let response = try decoder.decode(SetPriorityResponse.self, from: json)
        XCTAssertFalse(response.success)
        XCTAssertEqual(response.error, "Issue not found")
    }

    @MainActor
    func testDeleteCommentResponseDecoding() throws {
        let json = """
        {"success": true, "error": null}
        """.data(using: .utf8)!
        let response = try decoder.decode(DeleteCommentResponse.self, from: json)
        XCTAssertTrue(response.success)
    }

    @MainActor
    func testToggleLabelResponseDecoding() throws {
        let json = """
        {"success": false, "error": "Label not found on repo"}
        """.data(using: .utf8)!
        let response = try decoder.decode(ToggleLabelResponse.self, from: json)
        XCTAssertFalse(response.success)
        XCTAssertEqual(response.error, "Label not found on repo")
    }
}
