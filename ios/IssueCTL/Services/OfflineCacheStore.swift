import Foundation

struct OfflineCacheEntry<Value: Codable>: Codable {
    let value: Value
    let cachedAt: String
}

struct OfflineCacheStore {
    private let defaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func save<Value: Codable>(_ value: Value, for key: String, serverURL: String, cachedAt: String? = nil) {
        let entry = OfflineCacheEntry(value: value, cachedAt: cachedAt ?? currentTimestamp())
        guard let data = try? encoder.encode(entry) else { return }
        defaults.set(data, forKey: storageKey(key, serverURL: serverURL))
    }

    func load<Value: Codable>(_ type: Value.Type, for key: String, serverURL: String) -> OfflineCacheEntry<Value>? {
        guard let data = defaults.data(forKey: storageKey(key, serverURL: serverURL)) else { return nil }
        return try? decoder.decode(OfflineCacheEntry<Value>.self, from: data)
    }

    func remove(for key: String, serverURL: String) {
        defaults.removeObject(forKey: storageKey(key, serverURL: serverURL))
    }

    private func storageKey(_ key: String, serverURL: String) -> String {
        "issuectl.offline.\(sanitize(serverURL)).\(sanitize(key))"
    }

    private func sanitize(_ value: String) -> String {
        value
            .lowercased()
            .map { character in
                character.isLetter || character.isNumber ? character : "_"
            }
            .reduce(into: "") { $0.append($1) }
    }

    private func currentTimestamp() -> String {
        sharedISO8601Formatter.string(from: Date())
    }
}
