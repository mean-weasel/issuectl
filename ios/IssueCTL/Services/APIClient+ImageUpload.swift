import Foundation
import UIKit

// MARK: - Image Upload Response

struct ImageUploadResponse: Codable, Sendable {
    let url: String
}

// MARK: - APIClient Image Upload

extension APIClient {

    /// Upload an image to GitHub via the server's image upload endpoint.
    /// Uses multipart form data since the standard JSON request helper
    /// cannot handle file uploads.
    func uploadImage(image: UIImage, owner: String, repo: String) async throws -> String {
        guard let imageData = image.jpegData(compressionQuality: 0.8) else {
            throw APIError.invalidResponse
        }
        return try await uploadImageData(imageData, owner: owner, repo: repo)
    }

    func uploadImageData(_ imageData: Data, owner: String, repo: String) async throws -> String {
        guard let base = URL(string: serverURL) else {
            throw APIError.notConfigured
        }
        let boundary = UUID().uuidString
        var urlRequest = URLRequest(url: base.appendingPathComponent("/api/v1/images/upload"))
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()

        // owner field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"owner\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(owner)\r\n".data(using: .utf8)!)

        // repo field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"repo\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(repo)\r\n".data(using: .utf8)!)

        // file field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"image.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        urlRequest.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        if httpResponse.statusCode == 401 { throw APIError.unauthorized }
        if httpResponse.statusCode >= 400 {
            let errorBody = try? JSONDecoder().decode(ImageUploadErrorResponse.self, from: data)
            throw APIError.serverError(httpResponse.statusCode, errorBody?.error ?? "Upload failed")
        }

        return try decoder.decode(ImageUploadResponse.self, from: data).url
    }
}

private struct ImageUploadErrorResponse: Codable {
    let error: String
}
