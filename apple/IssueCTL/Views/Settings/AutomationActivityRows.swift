import SwiftUI

struct WebhookEventActivityRow: View {
    let event: WebhookEvent

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: event.iconName)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(event.tint)
                .frame(width: 30, height: 30)
                .background(event.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 5) {
                Text(event.activityTitle)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)

                if let detail = event.activityDetail {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Text(event.deliveryLine)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

struct ReviewRunActivityRow: View {
    let run: ReviewRun

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: run.status.iconName)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(run.status.tint)
                .frame(width: 30, height: 30)
                .background(run.status.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline) {
                    Text("PR #\(run.prNumber)")
                        .font(.subheadline.weight(.semibold))
                    Spacer(minLength: 8)
                    Text(run.status.displayName)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(run.status.tint)
                }

                if let repoFullName = run.repoFullName, !repoFullName.isEmpty {
                    Text(repoFullName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let summary = run.summary, !summary.isEmpty {
                    Text(summary)
                        .font(.caption)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Text(run.detailLine)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

private extension WebhookEvent {
    var activityTitle: String {
        var parts = [eventType]
        if let action, !action.isEmpty {
            parts.append(action)
        }
        if let target = targetLabel ?? fallbackTargetLabel {
            parts.append(target)
        }
        return parts.joined(separator: " ")
    }

    var activityDetail: String? {
        var parts: [String] = []
        if let repoFullName, !repoFullName.isEmpty {
            parts.append(repoFullName)
        }
        if let senderLogin, !senderLogin.isEmpty {
            parts.append("by \(senderLogin)")
        }
        if let result, !result.isEmpty {
            if let resultDetail, !resultDetail.isEmpty {
                parts.append("\(result): \(resultDetail)")
            } else {
                parts.append(result)
            }
        }
        if let intent {
            parts.append("intent \(intent.status)")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var deliveryLine: String {
        var parts = [deliveryId]
        if let receivedAtIso, !receivedAtIso.isEmpty {
            parts.append(receivedAtIso)
        }
        return parts.joined(separator: " · ")
    }

    var iconName: String {
        switch targetType {
        case .issue:
            return "smallcircle.filled.circle"
        case .pr:
            return "arrow.triangle.pull"
        case nil:
            return "dot.radiowaves.left.and.right"
        }
    }

    var tint: Color {
        switch result {
        case "accepted", "scheduled", "processed":
            return .green
        case "ignored", "skipped":
            return .secondary
        case "failed", "error":
            return .red
        default:
            return IssueCTLColors.action
        }
    }

    private var fallbackTargetLabel: String? {
        guard let targetType, let targetNumber else { return nil }
        switch targetType {
        case .issue:
            return "Issue #\(targetNumber)"
        case .pr:
            return "PR #\(targetNumber)"
        }
    }
}

private extension ReviewRun {
    var detailLine: String {
        var parts: [String] = []
        if let rangeLabel, !rangeLabel.isEmpty {
            parts.append(rangeLabel)
        }
        if let findingCount {
            parts.append("\(findingCount) finding\(findingCount == 1 ? "" : "s")")
        }
        if let headRef, !headRef.isEmpty {
            parts.append(headRef)
        }
        if let completedAtIso, !completedAtIso.isEmpty {
            parts.append(completedAtIso)
        } else if let startedAtIso, !startedAtIso.isEmpty {
            parts.append(startedAtIso)
        }
        return parts.isEmpty ? triggeredBy.displayName : parts.joined(separator: " · ")
    }
}

extension ReviewRunStatus {
    var displayName: String {
        switch self {
        case .reserved:
            return "Reserved"
        case .launching:
            return "Launching"
        case .inProgress:
            return "In Progress"
        case .completed:
            return "Completed"
        case .failed:
            return "Failed"
        case .superseded:
            return "Superseded"
        }
    }

    var iconName: String {
        switch self {
        case .reserved:
            return "clock"
        case .launching:
            return "paperplane"
        case .inProgress:
            return "arrow.clockwise"
        case .completed:
            return "checkmark.circle.fill"
        case .failed:
            return "exclamationmark.triangle.fill"
        case .superseded:
            return "arrow.uturn.backward.circle"
        }
    }

    var tint: Color {
        switch self {
        case .reserved, .launching, .inProgress:
            return IssueCTLColors.action
        case .completed:
            return .green
        case .failed:
            return .red
        case .superseded:
            return .secondary
        }
    }
}

extension ReviewRunStatusFilter {
    var displayName: String {
        switch self {
        case .all:
            return "All"
        case .reserved:
            return "Reserved"
        case .launching:
            return "Launching"
        case .inProgress:
            return "In Progress"
        case .completed:
            return "Completed"
        case .failed:
            return "Failed"
        case .superseded:
            return "Superseded"
        }
    }
}
