import AppKit
import CoreGraphics

struct MacSidebarDisplayDescriptor: Identifiable {
    let key: String
    let runtimeID: CGDirectDisplayID
    let name: String
    let frame: NSRect
    let visibleFrame: NSRect
    let isMain: Bool
    let screen: NSScreen

    var id: String { key }

    static func descriptor(for screen: NSScreen, index: Int) -> MacSidebarDisplayDescriptor {
        let runtimeID = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID ?? 0
        let vendor = CGDisplayVendorNumber(runtimeID)
        let model = CGDisplayModelNumber(runtimeID)
        let serial = CGDisplaySerialNumber(runtimeID)
        let key: String

        if runtimeID != 0, vendor != 0, model != 0, serial != 0 {
            key = "display-\(vendor)-\(model)-\(serial)"
        } else if runtimeID != 0 {
            key = "display-runtime-\(runtimeID)"
        } else {
            key = "display-frame-\(Int(screen.frame.origin.x))-\(Int(screen.frame.origin.y))-\(Int(screen.frame.width))-\(Int(screen.frame.height))-\(index)"
        }

        let localizedName = screen.localizedName.trimmingCharacters(in: .whitespacesAndNewlines)

        return MacSidebarDisplayDescriptor(
            key: key,
            runtimeID: runtimeID,
            name: localizedName.isEmpty ? "Display \(index + 1)" : localizedName,
            frame: screen.frame,
            visibleFrame: screen.visibleFrame,
            isMain: screen == NSScreen.main,
            screen: screen
        )
    }
}

protocol MacSidebarDisplayProviding {
    func currentDisplays() -> [MacSidebarDisplayDescriptor]
}

struct NSScreenSidebarDisplayProvider: MacSidebarDisplayProviding {
    func currentDisplays() -> [MacSidebarDisplayDescriptor] {
        NSScreen.screens.enumerated().map { index, screen in
            MacSidebarDisplayDescriptor.descriptor(for: screen, index: index)
        }
    }
}
