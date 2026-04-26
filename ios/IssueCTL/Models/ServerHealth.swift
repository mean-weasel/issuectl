import Foundation

struct ServerHealth: Codable, Sendable {
    let ok: Bool
    let version: String
    let timestamp: String
}
