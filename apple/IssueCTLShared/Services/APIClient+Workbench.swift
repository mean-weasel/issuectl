import Foundation

extension APIClient {
    func workbench() async throws -> WorkbenchPayload {
        let (data, _) = try await request(path: "/api/v1/workbench")
        return try decoder.decode(WorkbenchPayload.self, from: data)
    }
}
