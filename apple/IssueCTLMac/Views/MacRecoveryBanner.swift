import SwiftUI

struct MacRecoveryBanner: View {
    let message: String
    let actionTitle: String
    let isActionDisabled: Bool
    let action: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Label(message, systemImage: "exclamationmark.triangle")
                .font(.caption)
                .foregroundStyle(.orange)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 8)

            Button(actionTitle) {
                action()
            }
            .controlSize(.small)
            .disabled(isActionDisabled)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 8))
        .padding(.horizontal, 14)
        .padding(.bottom, 10)
    }
}
