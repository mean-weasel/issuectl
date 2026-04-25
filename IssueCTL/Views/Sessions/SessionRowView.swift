import SwiftUI

struct SessionRowView: View {
    let deployment: ActiveDeployment

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Circle()
                    .fill(.green)
                    .frame(width: 8, height: 8)
                Text(deployment.repoFullName)
                    .font(.subheadline.weight(.medium))
                Text("#\(deployment.issueNumber)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 8) {
                Label(deployment.branchName, systemImage: "arrow.triangle.branch")
                    .font(.caption.monospaced())
                    .lineLimit(1)

                Spacer()

                Label(deployment.runningDuration, systemImage: "clock")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}
