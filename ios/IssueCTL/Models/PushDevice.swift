import Foundation

struct PushDeviceRegistrationRequest: Codable, Equatable {
    let platform: String
    let token: String
    let environment: String
    let enabled: Bool
    let preferences: NotificationPreferences
}

struct PushDeviceUnregisterRequest: Codable, Equatable {
    let platform: String
    let token: String
}

struct PushDeviceRegistrationResponse: Codable, Equatable {
    let success: Bool
    let device: RegisteredPushDevice
}

struct RegisteredPushDevice: Codable, Equatable {
    let id: Int
    let platform: String
    let environment: String
    let preferences: NotificationPreferences
    let enabled: Bool
    let lastRegisteredAt: String
}
