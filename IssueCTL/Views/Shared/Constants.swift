import SwiftUI

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
