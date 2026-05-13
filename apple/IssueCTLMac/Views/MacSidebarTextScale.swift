import SwiftUI

private struct MacSidebarTextScaleKey: EnvironmentKey {
    static let defaultValue = MacSidebarPreferences.defaultTextScale
}

extension EnvironmentValues {
    var macSidebarTextScale: Double {
        get { self[MacSidebarTextScaleKey.self] }
        set { self[MacSidebarTextScaleKey.self] = newValue }
    }
}

extension Font {
    static func macSidebar(size: Double, weight: Font.Weight = .regular, scale: Double) -> Font {
        .system(size: size * scale, weight: weight)
    }
}
