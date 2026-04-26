import SwiftUI

/// A toggle chip that filters lists to show only items created by the current user.
/// Shows as disabled (grayed out) when the user fetch failed, rather than hiding entirely.
struct MineFilterChip: View {
    @Binding var isOn: Bool
    let isAvailable: Bool
    var isDisabled: Bool = false

    private var shouldShow: Bool { isAvailable || isDisabled }

    var body: some View {
        if shouldShow {
            Button {
                isOn.toggle()
            } label: {
                HStack(spacing: 4) {
                    if isOn {
                        Image(systemName: "checkmark")
                            .font(.caption2)
                    }
                    Text("Mine")
                        .font(.caption.weight(.medium))
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(isOn ? Color.accentColor.opacity(0.2) : Color.clear)
                .foregroundStyle(isOn ? Color.accentColor : Color.secondary)
                .overlay(
                    Capsule()
                        .strokeBorder(isOn ? Color.accentColor : Color.secondary.opacity(0.3), lineWidth: 1)
                )
                .clipShape(Capsule())
                .opacity(isDisabled ? 0.4 : 1.0)
            }
            .buttonStyle(.plain)
            .disabled(isDisabled)
        }
    }
}
